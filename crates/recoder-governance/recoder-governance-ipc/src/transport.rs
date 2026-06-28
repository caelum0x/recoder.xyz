//! Length-prefixed JSON-line framing over an async byte stream.
//!
//! Wire format (deliberately tiny — no CBOR, no heavy framing crate):
//!
//! ```text
//! +-------------------+----------------------------+
//! | u32 big-endian len| `len` bytes of UTF-8 JSON  |
//! +-------------------+----------------------------+
//! ```
//!
//! The length prefix is the byte count of the JSON payload (NOT including the
//! 4-byte header itself). The payload is a single serialized JSON value — the
//! "line" framing is the length prefix, so embedded newlines are irrelevant and
//! never need escaping.
//!
//! ## Hostile-by-default
//!
//! - A declared length above [`MAX_FRAME_LEN`] is rejected **before** any
//!   allocation — an attacker cannot make us reserve a multi-gigabyte buffer by
//!   lying about the length.
//! - A zero-length frame is rejected (it can never be valid JSON).
//! - A clean EOF at a frame boundary is surfaced as [`TransportError::Closed`]
//!   so the accept loop can shut the connection down without treating it as a
//!   protocol error.
//! - Parsing and validation happen at the [`crate::dispatch`] layer; this module
//!   only guarantees a bounded, well-delimited byte payload.

use thiserror::Error;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Maximum accepted frame payload size (1 MiB). Anything larger is treated as a
/// hostile or buggy peer and rejected without allocating the buffer. Governance
/// requests are small (bounded by `GovernanceRequest::MAX_TEXT_LEN` per field);
/// 1 MiB is generous headroom while still capping memory.
pub const MAX_FRAME_LEN: usize = 1024 * 1024;

/// The number of bytes in the length prefix.
const LEN_PREFIX: usize = 4;

/// A framing-layer error.
#[derive(Debug, Error)]
pub enum TransportError {
    /// The peer closed the connection at a frame boundary (clean EOF).
    #[error("connection closed by peer")]
    Closed,

    /// The peer declared a frame larger than [`MAX_FRAME_LEN`], or a zero-length
    /// frame. The connection should be dropped — we never trust the wire.
    #[error("invalid frame length {len} (max {max}, must be > 0)")]
    InvalidLength {
        /// The declared length.
        len: usize,
        /// The configured maximum.
        max: usize,
    },

    /// An underlying I/O error occurred mid-frame.
    #[error("transport io error: {0}")]
    Io(#[from] std::io::Error),
}

/// Read one length-prefixed frame's payload bytes from `reader`.
///
/// Returns [`TransportError::Closed`] on a clean EOF at the start of a frame,
/// and [`TransportError::InvalidLength`] for an oversized or zero-length frame
/// (rejected before allocation).
pub async fn read_frame<R>(reader: &mut R) -> Result<Vec<u8>, TransportError>
where
    R: AsyncReadExt + Unpin,
{
    let mut len_buf = [0u8; LEN_PREFIX];
    // A clean EOF *before any byte of the prefix* is a graceful close; an EOF
    // mid-prefix is a truncated/hostile frame (UnexpectedEof -> Io error).
    match reader.read_exact(&mut len_buf).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
            return Err(TransportError::Closed);
        }
        Err(e) => return Err(TransportError::Io(e)),
    }

    let len = u32::from_be_bytes(len_buf) as usize;
    if len == 0 || len > MAX_FRAME_LEN {
        return Err(TransportError::InvalidLength {
            len,
            max: MAX_FRAME_LEN,
        });
    }

    let mut payload = vec![0u8; len];
    reader.read_exact(&mut payload).await?;
    Ok(payload)
}

/// Write `payload` as one length-prefixed frame to `writer`.
///
/// Rejects an oversized payload with [`TransportError::InvalidLength`] rather
/// than emitting a frame the peer would reject — fail-closed on both ends.
pub async fn write_frame<W>(writer: &mut W, payload: &[u8]) -> Result<(), TransportError>
where
    W: AsyncWriteExt + Unpin,
{
    let len = payload.len();
    if len == 0 || len > MAX_FRAME_LEN {
        return Err(TransportError::InvalidLength {
            len,
            max: MAX_FRAME_LEN,
        });
    }
    let header = (len as u32).to_be_bytes();
    writer.write_all(&header).await?;
    writer.write_all(payload).await?;
    writer.flush().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[tokio::test]
    async fn round_trips_a_frame() {
        let mut buf: Vec<u8> = Vec::new();
        write_frame(&mut buf, b"{\"hello\":\"world\"}")
            .await
            .unwrap();

        let mut cursor = Cursor::new(buf);
        let payload = read_frame(&mut cursor).await.unwrap();
        assert_eq!(payload, b"{\"hello\":\"world\"}");
    }

    #[tokio::test]
    async fn clean_eof_is_closed_not_error() {
        let mut cursor = Cursor::new(Vec::<u8>::new());
        let err = read_frame(&mut cursor).await.unwrap_err();
        assert!(matches!(err, TransportError::Closed));
    }

    #[tokio::test]
    async fn oversized_declared_length_is_rejected_before_alloc() {
        // Declare a 2 MiB frame but provide no payload. We must reject on the
        // length alone, never trying to read (or allocate) 2 MiB.
        let huge = (MAX_FRAME_LEN as u32 + 1).to_be_bytes();
        let mut cursor = Cursor::new(huge.to_vec());
        let err = read_frame(&mut cursor).await.unwrap_err();
        assert!(matches!(
            err,
            TransportError::InvalidLength { len, .. } if len == MAX_FRAME_LEN + 1
        ));
    }

    #[tokio::test]
    async fn zero_length_frame_is_rejected() {
        let zero = 0u32.to_be_bytes();
        let mut cursor = Cursor::new(zero.to_vec());
        let err = read_frame(&mut cursor).await.unwrap_err();
        assert!(matches!(err, TransportError::InvalidLength { len: 0, .. }));
    }

    #[tokio::test]
    async fn truncated_payload_is_io_error_not_closed() {
        // Declare 10 bytes, supply only 3.
        let mut framed = 10u32.to_be_bytes().to_vec();
        framed.extend_from_slice(b"abc");
        let mut cursor = Cursor::new(framed);
        let err = read_frame(&mut cursor).await.unwrap_err();
        assert!(matches!(err, TransportError::Io(_)));
    }

    #[tokio::test]
    async fn write_rejects_oversized_payload() {
        let mut buf: Vec<u8> = Vec::new();
        let big = vec![0u8; MAX_FRAME_LEN + 1];
        let err = write_frame(&mut buf, &big).await.unwrap_err();
        assert!(matches!(err, TransportError::InvalidLength { .. }));
        assert!(buf.is_empty(), "nothing should be written on rejection");
    }
}
