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
	"fmt"
	"strings"

	"github.com/openziti/xweb/v3"
	log "github.com/sirupsen/logrus"
)

const (
	SpaBinding = "spa"
)

type SpaFactory struct {
}

var _ xweb.ApiHandlerFactory = &SpaFactory{}

func NewSpaFactory() *SpaFactory {
	return &SpaFactory{}
}

func (factory *SpaFactory) Validate(*xweb.InstanceConfig) error {
	return nil
}

func (factory *SpaFactory) Binding() string {
	return SpaBinding
}

func (factory *SpaFactory) New(_ *xweb.ServerConfig, options map[interface{}]interface{}) (xweb.ApiHandler, error) {
	urlPath, err := requiredStringOption(options, "path")
	if err != nil {
		return nil, err
	}
	if strings.ContainsAny(urlPath, "/\\") {
		return nil, fmt.Errorf("path must not contain path separators in the %s options", SpaBinding)
	}

	location, err := requiredStringOption(options, "location")
	if err != nil {
		return nil, err
	}

	indexFile := "index.html"
	if v, ok := options["indexFile"]; ok && v != nil {
		s, ok := v.(string)
		if !ok {
			return nil, fmt.Errorf("indexFile must be a string for the %s options", SpaBinding)
		}
		if s = strings.TrimSpace(s); s != "" {
			indexFile = s
		}
	}

	contextRoot := "/" + urlPath
	handler := &GenericHttpHandler{
		HttpHandler: SpaHandler(location, contextRoot, indexFile),
		BindingKey:  urlPath,
		ContextRoot: contextRoot,
	}

	log.Infof("initializing SPA handler %q from %s", urlPath, location)
	return handler, nil
}

func requiredStringOption(options map[interface{}]interface{}, key string) (string, error) {
	v, ok := options[key]
	if !ok || v == nil || v == "" {
		return "", fmt.Errorf("%s must be supplied in the %s options", key, SpaBinding)
	}
	s, ok := v.(string)
	if !ok {
		return "", fmt.Errorf("%s must be a string for the %s options", key, SpaBinding)
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return "", fmt.Errorf("%s must not be empty in the %s options", key, SpaBinding)
	}
	return s, nil
}
