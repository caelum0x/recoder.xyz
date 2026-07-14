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
	"github.com/openziti/xweb/v3"
	log "github.com/sirupsen/logrus"
)

// LegacyZacBinding is the historical binding name for the Ziti Admin Console SPA. It is kept
// as a back-compat shim so existing controller configs using `binding: zac` continue to load
// without modification. New configs should prefer `binding: spa` with an explicit `path`.
const LegacyZacBinding = "zac"

type ZitiAdminConsoleFactory struct {
	delegate *SpaFactory
}

var _ xweb.ApiHandlerFactory = &ZitiAdminConsoleFactory{}

func NewZitiAdminConsoleFactory() *ZitiAdminConsoleFactory {
	return &ZitiAdminConsoleFactory{delegate: NewSpaFactory()}
}

func (factory *ZitiAdminConsoleFactory) Validate(c *xweb.InstanceConfig) error {
	return factory.delegate.Validate(c)
}

func (factory *ZitiAdminConsoleFactory) Binding() string {
	return LegacyZacBinding
}

func (factory *ZitiAdminConsoleFactory) New(serverConfig *xweb.ServerConfig, options map[interface{}]interface{}) (xweb.ApiHandler, error) {
	log.Warnf("the %q binding is deprecated; switch to `binding: spa` with `path: zac` in your controller config", LegacyZacBinding)

	// Inject the implicit path = "zac" so the generic SPA factory produces the same /zac context root
	// the original ZAC handler used. We copy to avoid mutating the caller's map.
	merged := make(map[interface{}]interface{}, len(options)+1)
	for k, v := range options {
		merged[k] = v
	}
	if _, hasPath := merged["path"]; !hasPath {
		merged["path"] = LegacyZacBinding
	}

	handler, err := factory.delegate.New(serverConfig, merged)
	if err != nil {
		return nil, err
	}

	// Preserve the historical behavior where the ZAC handler also matched absolute "/assets/*"
	// URLs, since the original ZAC bundle was not built with a base href.
	if generic, ok := handler.(*GenericHttpHandler); ok {
		generic.ExtraPrefixes = append(generic.ExtraPrefixes, "/assets")
	}

	return handler, nil
}
