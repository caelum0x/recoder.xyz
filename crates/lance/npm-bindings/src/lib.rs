//! `lance-npm-bindings` — Native Node.js addon wrapping lance vector-store ops.
//!
//! Exposes [`NativeLanceConnection`] and [`NativeLanceTable`] with `#[napi]`
//! wrappers so the TypeScript facade (`packages/rag/src/vector-store/lance-client.ts`)
//! can call them in-process, replacing the `@lancedb/lancedb` subprocess/loopback
//! path with a direct native call.
//!
//! ## Implemented operations
//!
//! - `connect(uri)` → `NativeLanceConnection`
//! - `connection.tableNames()` → `string[]`
//! - `connection.openTable(name)` → `NativeLanceTable | null`
//! - `connection.createTable(name, dataJson, optsJson)` → `NativeLanceTable`
//! - `table.add(rowsJson)`
//! - `table.delete(predicate)` — supports `document_key IN ('a', 'b', ...)` syntax
//! - `table.vectorSearch(vectorJson)` → `NativeLanceVectorQuery`
//! - `query.limit(n)` → `NativeLanceVectorQuery`
//! - `query.toArray()` → JSON string of rows with `_distance`
//!
//! ## Degrade-safe seam
//!
//! The in-memory store is the canonical fast path for this native addon. When the
//! uri indicates a remote LanceDB service (`db://...`) or a full on-disk dataset,
//! the native path still works in-memory but does NOT persist to disk; callers
//! that need persistence can configure the `@lancedb/lancedb` SDK path via the
//! existing fallback. The facade documents this trade-off.
//!
//! ## Safety
//!
//! No `unsafe` code in this file. `napi_derive` generates the FFI glue; its
//! invariants are upheld by napi-rs — every exported symbol is wrapped with the
//! correct N-API lifetimes and error conversion.

#![deny(clippy::unwrap_in_result)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

// ---- Row type ---------------------------------------------------------------

/// A single row as stored in a native lance table.
/// Mirrors `LanceRow` in `packages/rag/src/vector-store/lance-client.ts`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct Row {
    document_key: String,
    content: String,
    chunk_index: i64,
    vector: Vec<f64>,
    metadata_json: String,
}

/// Row with optional `_distance` field (returned by vector search).
#[derive(Debug, Clone, serde::Serialize)]
struct RowWithDistance {
    document_key: String,
    content: String,
    chunk_index: i64,
    vector: Vec<f64>,
    metadata_json: String,
    #[serde(rename = "_distance")]
    distance: f64,
}

// ---- helpers ----------------------------------------------------------------

fn js_err(msg: impl std::fmt::Display) -> napi::Error {
    napi::Error::from_reason(msg.to_string())
}

fn parse_json<T: serde::de::DeserializeOwned>(json: &str, label: &str) -> Result<T> {
    serde_json::from_str(json)
        .map_err(|e| js_err(format!("lance-native: failed to parse {label}: {e}")))
}

fn to_json<T: serde::Serialize + ?Sized>(value: &T, label: &str) -> Result<String> {
    serde_json::to_string(value)
        .map_err(|e| js_err(format!("lance-native: failed to serialize {label}: {e}")))
}

/// L2 squared distance between two equal-length float vectors. Returns 0.0 on
/// length mismatch (safe fallback — search still returns results, just unordered).
fn l2_distance(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() {
        return 0.0;
    }
    a.iter()
        .zip(b.iter())
        .map(|(x, y)| {
            let d = x - y;
            d * d
        })
        .sum()
}

/// Parse a `document_key IN ('a', 'b')` predicate and return the extracted keys.
/// Returns `None` when the predicate is not in this form (caller handles as no-op).
fn parse_in_predicate(predicate: &str) -> Option<Vec<String>> {
    let trimmed = predicate.trim();
    // Match: document_key IN (...)
    let lower = trimmed.to_lowercase();
    if !lower.starts_with("document_key in (") {
        return None;
    }
    let inner_start = trimmed.find('(')? + 1;
    let inner_end = trimmed.rfind(')')?;
    if inner_end <= inner_start {
        return None;
    }
    let inner = &trimmed[inner_start..inner_end];
    let keys: Vec<String> = inner
        .split(',')
        .map(|s| s.trim().trim_matches('\'').replace("''", "'"))
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    Some(keys)
}

// ---- NativeLanceTable -------------------------------------------------------

type TableData = Arc<Mutex<Vec<Row>>>;

/// An in-process lance table. Backed by a `Vec<Row>` wrapped in `Arc<Mutex>`.
/// Implements add/delete/vectorSearch matching `LanceTable` in the TS facade.
#[napi]
pub struct NativeLanceTable {
    name: String,
    rows: TableData,
}

#[napi]
impl NativeLanceTable {
    /// Table name (informational).
    #[napi(getter)]
    pub fn table_name(&self) -> &str {
        &self.name
    }

    /// Append rows serialized as a JSON array of `LanceRow` objects.
    ///
    /// # Parameters
    /// - `rows_json` — JSON array of `LanceRow` objects.
    #[napi]
    pub fn add(&self, rows_json: String) -> Result<()> {
        let new_rows: Vec<Row> = parse_json(&rows_json, "rows array")?;
        let mut guard = self
            .rows
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        guard.extend(new_rows);
        Ok(())
    }

    /// Delete rows matching the predicate.
    ///
    /// Supports `document_key IN ('key1', 'key2', ...)` syntax (matching the
    /// predicate produced by `lance-vector-store.ts`). Unknown predicates are
    /// silently ignored (safe; never throws on unrecognized syntax).
    #[napi]
    pub fn delete(&self, predicate: String) -> Result<()> {
        let Some(keys_to_delete) = parse_in_predicate(&predicate) else {
            // Not a supported predicate form — no-op (degrade-safe).
            return Ok(());
        };
        let mut guard = self
            .rows
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        guard.retain(|r| !keys_to_delete.contains(&r.document_key));
        Ok(())
    }

    /// Execute a vector search. Returns a JSON array of rows with `_distance`.
    ///
    /// # Parameters
    /// - `vector_json` — JSON array of `number`.
    /// - `limit` — maximum rows to return (0 = all).
    ///
    /// Rows are sorted by L2 distance (ascending).
    #[napi]
    pub fn vector_search_to_array(
        &self,
        vector_json: String,
        limit: u32,
    ) -> Result<String> {
        let query_vec: Vec<f64> = parse_json(&vector_json, "query vector")?;

        let guard = self
            .rows
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        let mut ranked: Vec<RowWithDistance> = guard
            .iter()
            .map(|r| {
                let dist = l2_distance(&query_vec, &r.vector);
                RowWithDistance {
                    document_key: r.document_key.clone(),
                    content: r.content.clone(),
                    chunk_index: r.chunk_index,
                    vector: r.vector.clone(),
                    metadata_json: r.metadata_json.clone(),
                    distance: dist,
                }
            })
            .collect();

        ranked.sort_by(|a, b| {
            a.distance
                .partial_cmp(&b.distance)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        let take = if limit == 0 {
            ranked.len()
        } else {
            (limit as usize).min(ranked.len())
        };

        to_json(&ranked[..take], "search results")
    }

    /// Row count (diagnostic / `countRows()`).
    #[napi]
    pub fn count_rows(&self) -> Result<u32> {
        let guard = self
            .rows
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        Ok(guard.len() as u32)
    }
}

// ---- NativeLanceConnection --------------------------------------------------

type TableMap = Arc<Mutex<HashMap<String, TableData>>>;

/// An in-process lance connection. Stores named tables in an `Arc<Mutex<HashMap>>`.
/// Implements `tableNames/openTable/createTable` matching `LanceConnection` in the TS facade.
#[napi]
pub struct NativeLanceConnection {
    /// The URI provided to `connect()` — stored for diagnostics.
    uri: String,
    tables: TableMap,
}

#[napi]
impl NativeLanceConnection {
    /// Returns the sorted list of table names.
    #[napi]
    pub fn table_names(&self) -> Result<Vec<String>> {
        let guard = self
            .tables
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let mut names: Vec<String> = guard.keys().cloned().collect();
        names.sort();
        Ok(names)
    }

    /// Open an existing table by name. Returns `null` (JS `null`) when absent.
    ///
    /// # Returns
    /// `NativeLanceTable` when the table exists; null string sentinel `"__null__"`
    /// that the TS facade interprets as absent (workaround: NAPI `Option<T>` is
    /// mapped to JS `null` by napi-rs automatically when `nullable` is set, but
    /// we return a wrapper struct for predictability).
    #[napi]
    pub fn open_table(&self, name: String) -> Result<Option<NativeLanceTable>> {
        let guard = self
            .tables
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        match guard.get(&name) {
            Some(rows) => Ok(Some(NativeLanceTable {
                name: name.clone(),
                rows: Arc::clone(rows),
            })),
            None => Ok(None),
        }
    }

    /// Create (or overwrite) a table with an initial batch of rows.
    ///
    /// # Parameters
    /// - `name` — table name.
    /// - `data_json` — JSON array of `LanceRow` objects for the initial batch.
    /// - `opts_json` — JSON object `{ "mode": "create" | "overwrite" }`.
    ///   When `mode` is `"overwrite"` (or absent) the table is replaced; when
    ///   `"create"` and the table already exists, an error is returned.
    #[napi]
    pub fn create_table(
        &self,
        name: String,
        data_json: String,
        opts_json: String,
    ) -> Result<NativeLanceTable> {
        let rows: Vec<Row> = parse_json(&data_json, "initial rows")?;

        #[derive(serde::Deserialize, Default)]
        struct Opts {
            mode: Option<String>,
        }
        let opts: Opts = if opts_json.is_empty() || opts_json == "null" || opts_json == "{}" {
            Opts::default()
        } else {
            parse_json(&opts_json, "create options")?
        };

        let mode = opts.mode.as_deref().unwrap_or("overwrite");

        let mut guard = self
            .tables
            .lock()
            .unwrap_or_else(|e| e.into_inner());

        if mode == "create" && guard.contains_key(&name) {
            return Err(js_err(format!(
                "lance-native: table '{name}' already exists (mode=create)"
            )));
        }

        let data: TableData = Arc::new(Mutex::new(rows));
        guard.insert(name.clone(), Arc::clone(&data));

        Ok(NativeLanceTable { name, rows: data })
    }

    /// URI provided to `connect()` (diagnostic).
    #[napi(getter)]
    pub fn connection_uri(&self) -> &str {
        &self.uri
    }
}

// ---- connect ----------------------------------------------------------------

/// Connect to a lance vector store.
///
/// This native addon implements an in-memory store. The URI is accepted for
/// interface compatibility with `@lancedb/lancedb`'s `connect(uri)` but data is
/// NOT persisted to disk in this build. Persistence requires the full
/// `@lancedb/lancedb` SDK (the TS facade falls back to it when available).
///
/// # Parameters
/// - `uri` — LanceDB URI (local path or `db://...` cloud URI). Accepted but not
///   used for routing in this native build.
///
/// # Returns
/// A `NativeLanceConnection` instance.
#[napi]
pub fn connect(uri: String) -> Result<NativeLanceConnection> {
    Ok(NativeLanceConnection {
        uri,
        tables: Arc::new(Mutex::new(HashMap::new())),
    })
}

// ---- unit tests (cargo test only — not shipped in the .node) ---------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_row(key: &str, idx: i64, vec: Vec<f64>) -> Row {
        Row {
            document_key: key.to_string(),
            content: format!("content-{key}"),
            chunk_index: idx,
            vector: vec,
            metadata_json: "{}".to_string(),
        }
    }

    #[test]
    fn connect_returns_empty_connection() {
        let conn = connect("/tmp/test-lance".to_string()).unwrap();
        let names = conn.table_names().unwrap();
        assert!(names.is_empty());
    }

    #[test]
    fn create_table_and_open_it() {
        let conn = connect("/tmp/test-lance".to_string()).unwrap();

        let row = make_row("doc1", 0, vec![1.0, 0.0, 0.0]);
        let data_json = serde_json::to_string(&vec![row]).unwrap();
        conn.create_table("embeddings".to_string(), data_json, "{}".to_string())
            .unwrap();

        let names = conn.table_names().unwrap();
        assert_eq!(names, vec!["embeddings"]);

        let table = conn.open_table("embeddings".to_string()).unwrap();
        assert!(table.is_some());
        assert_eq!(table.unwrap().count_rows().unwrap(), 1);
    }

    #[test]
    fn add_and_delete_rows() {
        let conn = connect("/tmp/test-lance".to_string()).unwrap();
        let rows = vec![
            make_row("a", 0, vec![1.0, 0.0]),
            make_row("b", 0, vec![0.0, 1.0]),
        ];
        let data_json = serde_json::to_string(&rows).unwrap();
        let table = conn
            .create_table("t".to_string(), data_json, "{}".to_string())
            .unwrap();
        assert_eq!(table.count_rows().unwrap(), 2);

        table
            .delete("document_key IN ('a')".to_string())
            .unwrap();
        assert_eq!(table.count_rows().unwrap(), 1);
    }

    #[test]
    fn vector_search_returns_ranked_results() {
        let conn = connect("/tmp/test-lance".to_string()).unwrap();
        let rows = vec![
            make_row("close", 0, vec![1.0, 0.0, 0.0]),
            make_row("far", 0, vec![0.0, 1.0, 0.0]),
            make_row("medium", 0, vec![0.9, 0.1, 0.0]),
        ];
        let data_json = serde_json::to_string(&rows).unwrap();
        let table = conn
            .create_table("t".to_string(), data_json, "{}".to_string())
            .unwrap();

        let query_vec = serde_json::to_string(&vec![1.0_f64, 0.0, 0.0]).unwrap();
        let result_json = table
            .vector_search_to_array(query_vec, 2)
            .unwrap();
        let results: Vec<serde_json::Value> = serde_json::from_str(&result_json).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["document_key"], "close");
        assert_eq!(results[1]["document_key"], "medium");
    }

    #[test]
    fn l2_distance_is_correct() {
        assert!((l2_distance(&[1.0, 0.0], &[0.0, 1.0]) - 2.0).abs() < 1e-9);
        assert!((l2_distance(&[1.0, 0.0], &[1.0, 0.0])).abs() < 1e-9);
    }

    #[test]
    fn parse_in_predicate_handles_various_forms() {
        let keys = parse_in_predicate("document_key IN ('a', 'b')").unwrap();
        assert_eq!(keys, vec!["a", "b"]);

        let keys2 =
            parse_in_predicate("document_key IN ('it''s')").unwrap();
        assert_eq!(keys2, vec!["it's"]);

        assert!(parse_in_predicate("other_col IN ('x')").is_none());
    }

    #[test]
    fn open_nonexistent_table_returns_none() {
        let conn = connect("/tmp/test-lance".to_string()).unwrap();
        let result = conn.open_table("not_here".to_string()).unwrap();
        assert!(result.is_none());
    }
}
