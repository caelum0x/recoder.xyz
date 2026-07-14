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
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestMatchesPrefix(t *testing.T) {
	cases := []struct {
		path, prefix string
		want         bool
	}{
		{"/zac", "/zac", true},
		{"/zac/", "/zac", true},
		{"/zac/foo", "/zac", true},
		{"/zac/foo/bar", "/zac", true},
		{"/zacfoo", "/zac", false},
		{"/zac../etc", "/zac", false},
		{"/zac..", "/zac", false},
		{"/", "/zac", false},
		{"/other", "/zac", false},
	}
	for _, c := range cases {
		if got := matchesPrefix(c.path, c.prefix); got != c.want {
			t.Errorf("matchesPrefix(%q,%q)=%v want %v", c.path, c.prefix, got, c.want)
		}
	}
}

func TestPathContainedIn(t *testing.T) {
	root := filepath.Clean("/srv/spa")
	cases := []struct {
		candidate string
		want      bool
	}{
		{filepath.Clean("/srv/spa"), true},
		{filepath.Clean("/srv/spa/index.html"), true},
		{filepath.Clean("/srv/spa/sub/file"), true},
		{filepath.Clean("/srv/spa/../escape"), false},
		{filepath.Clean("/etc/passwd"), false},
		{filepath.Clean("/srv/spa-evil/file"), false},
	}
	for _, c := range cases {
		if got := pathContainedIn(c.candidate, root); got != c.want {
			t.Errorf("pathContainedIn(%q,%q)=%v want %v", c.candidate, root, got, c.want)
		}
	}
}

// TestSpaHandlerNoTraversal exercises the full SPA file-serving pipeline against URLs that
// attempt to escape the content directory. Any escape attempt must fall back to the index
// file rather than serving content from outside the root.
func TestSpaHandlerNoTraversal(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("INDEX"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "real.txt"), []byte("REAL"), 0o644); err != nil {
		t.Fatal(err)
	}

	parent := filepath.Dir(dir)
	secret := filepath.Join(parent, "secret.txt")
	if err := os.WriteFile(secret, []byte("SECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove(secret) })

	h := SpaHandler(dir, "/zac", "index.html")

	serve := func(rawPath string) (int, string) {
		req := httptest.NewRequest(http.MethodGet, "http://example.test"+rawPath, nil)
		req.URL.Path = rawPath
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		return rr.Code, rr.Body.String()
	}

	type expect int
	const (
		expectExact expect = iota
		expectNoLeak
	)
	cases := []struct {
		name string
		path string
		mode expect
		body string
	}{
		{"happy path", "/zac/real.txt", expectExact, "REAL"},
		{"missing file falls back to index", "/zac/missing", expectExact, "INDEX"},
		{"traversal via dotdot does not leak", "/zac/../secret.txt", expectNoLeak, ""},
		{"deep traversal does not leak", "/zac/a/b/../../../secret.txt", expectNoLeak, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			code, body := serve(c.path)
			if body == "SECRET" {
				t.Fatalf("LEAKED secret via %s (status %d)", c.path, code)
			}
			if c.mode == expectExact && body != c.body {
				t.Errorf("path %s: got body %q want %q (status %d)", c.path, body, c.body, code)
			}
		})
	}
}
