// First-party static deployments only. This is independent of H6's proposed customer hosting.
export const OWNED_APPS = Object.freeze({
  pages: { repo: 'pages', appId: 'app_3f65398b-b2d1-4f20-a9de-3458894ce31d', legacy: 'https://curtcox.github.io/pages/' },
  python: { repo: 'PythonOnline', appId: 'app_2eabd9ad-8b90-4635-accd-7583e5241f96', legacy: 'https://curtcox.github.io/PythonOnline/' },
  manim: { repo: 'ManimOnline', appId: 'app_ea30117c-555b-4759-b01a-e75dc402d177', legacy: 'https://curtcox.github.io/ManimOnline/' },
  gnuplot: { repo: 'GnuPlotOnline', appId: 'app_69800851-cef2-4274-9c7b-b1e908965181', legacy: 'https://curtcox.github.io/GnuplotOnline/' },
  sheets: { repo: 'sheets', appId: 'app_8e03e133-83b4-4ee2-b3d5-39397f573879', legacy: 'https://curtcox.github.io/sheets/index.html' },
  gripeline: { repo: 'gripeline', appId: 'app_dc8bf51a-ebee-4ef0-879e-1cccbfc1a01b', legacy: 'https://curtcox.github.io/gripeline/editor/' },
  modl: { repo: 'modl', appId: 'app_1fe78cf6-21fc-4491-abc9-e0aefca53505', legacy: 'https://curtcox.github.io/modl/' },
  diagram: { repo: 'hashbin.org', appId: 'app_92c56b62-d5bf-4d8c-8577-79c104adf401', legacy: 'https://curtcox.github.io/hashbin.org/diagram-oauth.html' },
  upload: { repo: 'hashbin.org', appId: 'app_cfebb3a2-b0bd-47f6-b616-8f70d77e6886', legacy: 'https://curtcox.github.io/hashbin.org/upload-via-registered-app.html' },
  textpad: { repo: 'hashbin.org', appId: 'app_1a74e62b-d752-4a3c-81af-5c850af18c5b', legacy: 'https://hashbin.org/docs/textpad/app' },
  r: { repo: 'R', appId: 'app_d38327d1-7d1a-40c0-925c-8b3deea6e51e', legacy: 'https://curtcox.github.io/R/' },
  livelier: { repo: 'livelier', appId: 'app_f044e0da-520a-4196-81f5-041c78f43c02', legacy: 'https://curtcox.github.io/livelier/' },
  apptron: { repo: 'apptron', appId: 'app_4988e882-b216-42ef-8d95-9f1747c6b55e', legacy: 'https://curtcox.github.io/apptron/' },
  audio: { repo: 'AudioOnline', appId: 'app_da72a010-439f-4772-b664-791ed9333c29', legacy: 'https://curtcox.github.io/AudioOnline/' }
});

/** The approved canonical origin of a first-party editor or its preview host. */
export function ownedAppOrigin(slug) {
  if (slug === 'pages-preview') return 'https://pages.hashbin.us';
  if (!Object.hasOwn(OWNED_APPS, slug)) throw new Error(`Unknown owned app: ${slug}`);
  return `https://${slug}.hashbin.page`;
}
