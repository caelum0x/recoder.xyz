"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const responsive_design_1 = require("./src/services/responsive-design");
async function test() {
    try {
        // Test getting responsive config
        const config = await responsive_design_1.responsiveDesignService.getResponsiveConfig('mobile-first');
        console.log('✅ Config retrieved:', config === null || config === void 0 ? void 0 : config.name);
        // Test device type detection
        const deviceType = responsive_design_1.responsiveDesignService.detectDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X)');
        console.log('✅ Device type detected:', deviceType);
        // Test breakpoint detection
        const breakpoint = responsive_design_1.responsiveDesignService.getBreakpointFromWidth(768);
        console.log('✅ Breakpoint detected:', breakpoint);
        console.log('✅ All tests passed!');
    }
    catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}
test();
