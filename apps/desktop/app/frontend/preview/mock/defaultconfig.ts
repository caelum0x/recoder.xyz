// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import backgroundsJson from "../../../../server/pkg/wconfig/defaultconfig/backgrounds.json";
import mimetypesJson from "../../../../server/pkg/wconfig/defaultconfig/mimetypes.json";
import presetsJson from "../../../../server/pkg/wconfig/defaultconfig/presets.json";
import settingsJson from "../../../../server/pkg/wconfig/defaultconfig/settings.json";
import termthemesJson from "../../../../server/pkg/wconfig/defaultconfig/termthemes.json";
import waveaiJson from "../../../../server/pkg/wconfig/defaultconfig/waveai.json";
import widgetsJson from "../../../../server/pkg/wconfig/defaultconfig/widgets.json";

export const DefaultFullConfig: FullConfigType = {
    settings: settingsJson as SettingsType,
    mimetypes: mimetypesJson as unknown as { [key: string]: MimeTypeConfigType },
    defaultwidgets: widgetsJson as unknown as { [key: string]: WidgetConfigType },
    widgets: {},
    presets: presetsJson as unknown as { [key: string]: MetaType },
    termthemes: termthemesJson as unknown as { [key: string]: TermThemeType },
    connections: {},
    bookmarks: {},
    waveai: waveaiJson as unknown as { [key: string]: AIModeConfigType },
    backgrounds: backgroundsJson as { [key: string]: BackgroundConfigType },
    configerrors: [],
    version: "",
    buildtime: "",
};
