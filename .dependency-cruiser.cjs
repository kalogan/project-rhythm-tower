/**
 * Architecture guard. The single most important invariant:
 * src/core is the PURE deterministic source of truth — it imports NO renderer,
 * no React/three/DOM, no audio, no content-render/game/art modules. Everything
 * else is a projection of the core.
 */
module.exports = {
  forbidden: [
    {
      name: 'core-stays-pure',
      severity: 'error',
      comment:
        'src/core must stay engine-agnostic & deterministic: no React/three/DOM/audio/IO and no game/art/render imports.',
      from: { path: '^src/core' },
      to: {
        path: [
          '^src/game',
          '^src/art',
          '^src/lint',
          'react',
          'react-dom',
          '^three',
          '^@react-three',
        ],
      },
    },
    {
      name: 'content-data-stays-pure',
      severity: 'error',
      comment: 'src/content (schemas + data) must not import the renderer or game layer.',
      from: { path: '^src/content' },
      to: { path: ['^src/game', '^src/art', 'react', 'react-dom', '^three', '^@react-three'] },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No circular dependencies.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Orphan modules are usually dead code.',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)main\\.tsx$', '(^|/)index\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] },
  },
};
