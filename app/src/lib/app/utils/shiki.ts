import {
    createdBundledHighlighter,
    createOnigurumaEngine,
    createSingletonShorthands,
    type ShikiTransformer,
} from 'shiki'

// wtf
const highlighterFactory = createdBundledHighlighter({
    langs: {
        json: () => import('shiki/langs/json.mjs')
    },
    themes: {
        'vitesse-dark': () => import('shiki/themes/vitesse-dark.mjs'),
        'vitesse-light': () => import('shiki/themes/vitesse-light.mjs'),
    },
    engine: () => createOnigurumaEngine(import('shiki/wasm')),
});

const shiki = createSingletonShorthands(highlighterFactory);

const lineNumbersTransformer: ShikiTransformer = {
    pre(hast) {
        this.addClassToHast(hast, 'line-numbers');
    }
}

const lineWrapTransformer: ShikiTransformer = {
    pre(hast) {
        this.addClassToHast(hast, 'line-wrap');
    }
}

export type Options = {
    lineNumbers?: boolean;
    lineWrap?: boolean;
}

const defaultOptions: Options = {
    lineNumbers: true,
    lineWrap: true,
}

export function renderJson(json: string, options?: Options): Promise<string> {
    options = {
        ...defaultOptions,
        ...options,
    };
    return shiki.codeToHtml(json, {
        lang: 'json',
        themes: {
            light: 'vitesse-light',
            dark: 'vitesse-dark',
        },
        defaultColor: 'light-dark()',
        transformers: [
            options.lineNumbers ? lineNumbersTransformer : {},
            options.lineWrap ? lineWrapTransformer : {},
        ]
    });
}
