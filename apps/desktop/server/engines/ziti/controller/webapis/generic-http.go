/*
	Copyright NetFoundry Inc.

	Licensed under the Apache License, Version 2.0 (the "License");
	you may not use this file except in compliance with the License.
	You may obtain a copy of the License at

	https://www.apache.org/licenses/LICENSE-2.0

	Unless required by applicable law or agreed to in writing, software
	distributed under the License is distributed on an "AS IS" BASIS,
	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
	See the License for the specific language governing permissions and
	limitations under the License.
*/

package webapis

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type GenericHttpHandler struct {
	HttpHandler http.Handler
	BindingKey  string
	ContextRoot string
	// ExtraPrefixes lets a SPA claim additional URL prefixes outside its context root.
	// Used by the legacy ZAC handler to keep matching absolute "/assets" URLs from bundles
	// that weren't built with a base href.
	ExtraPrefixes []string
}

func (spa *GenericHttpHandler) Binding() string {
	return spa.BindingKey
}

func (spa *GenericHttpHandler) Options() map[interface{}]interface{} {
	return nil
}

func (spa *GenericHttpHandler) RootPath() string {
	return "/" + spa.BindingKey
}

func (spa *GenericHttpHandler) IsHandler(r *http.Request) bool {
	if matchesPrefix(r.URL.Path, spa.ContextRoot) {
		return true
	}
	for _, p := range spa.ExtraPrefixes {
		if matchesPrefix(r.URL.Path, p) {
			return true
		}
	}
	return false
}

// matchesPrefix returns true only if path is exactly prefix or prefix followed by '/'. This
// prevents "/zac" from matching "/zacanything" or "/zac../foo", which would let a request
// slip past the handler boundary check and into the SPA file resolution path.
func matchesPrefix(path, prefix string) bool {
	if path == prefix {
		return true
	}
	if strings.HasPrefix(path, prefix+"/") {
		return true
	}
	return false
}

func (spa *GenericHttpHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	spa.HttpHandler.ServeHTTP(writer, request)
}

// Thanks to https://github.com/roberthodgen/spa-server
// Serve from a public directory with specific index
type spaHandler struct {
	content     string // The directory from which to serve
	contextRoot string // The context root to remove
	indexFile   string // The fallback/default file to serve
}

// Falls back to a supplied index (indexFile) when either condition is true:
// (1) Request (file) path is not found
// (2) Request path is a directory
// (3) Resolved file path escapes the content root (defense in depth against directory traversal)
// Otherwise serves the requested file.
func (h *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	r.URL.Path = strings.TrimPrefix(r.URL.Path, h.contextRoot)
	p := filepath.Join(h.content, filepath.Clean("/"+r.URL.Path))

	indexPath := filepath.Join(h.content, h.indexFile)

	if !pathContainedIn(p, h.content) {
		http.ServeFile(w, r, indexPath)
		return
	}

	if info, err := os.Stat(p); err != nil {
		http.ServeFile(w, r, indexPath)
		return
	} else if info.IsDir() {
		http.ServeFile(w, r, indexPath)
		return
	}

	http.ServeFile(w, r, p)
}

// pathContainedIn returns true if candidate resolves to a path inside (or equal to) root. Both
// inputs are cleaned and compared via filepath.Rel so we don't depend on lexical prefix tricks
// or symlink-free assumptions. This is the canonical containment check that keeps SPA file
// serving from escaping its configured location even if the URL routing layer ever lets a
// path with traversal sequences through.
func pathContainedIn(candidate, root string) bool {
	rel, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return false
	}
	return true
}

// SpaHandler returns a request handler (http.Handler) that serves a single
// page application from a given public directory (location).
func SpaHandler(location string, contextRoot string, indexFile string) http.Handler {
	return &spaHandler{filepath.Clean(location), contextRoot, indexFile}
}
