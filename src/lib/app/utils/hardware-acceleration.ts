const softwareRendererPattern =
    /swiftshader|llvmpipe|softpipe|lavapipe|software rasterizer|microsoft basic render|mesa offscreen/i;

let cachedHardwareAcceleration: boolean | undefined;

export function hasHardwareAcceleration() {
    return cachedHardwareAcceleration ??= detectHardwareAcceleration();
}

function detectHardwareAcceleration() {
    try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (!context) return false;

        const rendererInfo = context.getExtension("WEBGL_debug_renderer_info");
        const renderer = rendererInfo
            ? context.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
            : null;

        context.getExtension("WEBGL_lose_context")?.loseContext();
        return typeof renderer !== "string" || !softwareRendererPattern.test(renderer);
    } catch {
        return false;
    }
}
