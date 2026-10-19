// Running real app code in another time zone.
//
// Jest workers ignore TZ changes made inside a test (on Windows at least; see
// jest.globalSetup.js), so code that must hold in every zone is compiled and
// run in a child Node process with TZ set:
//
//   const z = prepareZones(['clock', 'date', 'taskRepeat']);
//   z.run('Asia/Kolkata', 'return m.date.addDaysISO("2026-03-08", 1)');
//
// Inside `body`, `m.<name>` is each compiled module. It must return JSON-able
// data. Modules are pure utils from src/utils (no React, no stores).
const fs = require('fs') as { mkdirSync: (p: string, o: object) => void; readFileSync: (p: string, e: string) => string; writeFileSync: (p: string, d: string) => void };
const path = require('path') as { join: (...p: string[]) => string };
const os = require('os') as { tmpdir: () => string };
const { spawnSync } = require('child_process') as {
  spawnSync: (cmd: string, args: string[], o: { env: Record<string, string | undefined>; encoding: 'utf8' }) => { status: number | null; stdout: string; stderr: string };
};
const babel = require('@babel/core') as { transformSync: (code: string, opts: Record<string, unknown>) => { code?: string | null } | null };
const resolveModule = (require as unknown as { resolve: (id: string) => string }).resolve;

export const ZONES = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Pacific/Auckland', 'America/Santiago'] as const;

let counter = 0;

export function prepareZones(modules: string[]) {
  const dir = path.join(os.tmpdir(), `ona-zones-${process.pid}-${++counter}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of modules) {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/utils', `${name}.ts`), 'utf8');
    const out = babel.transformSync(src, {
      filename: `${name}.ts`,
      babelrc: false,
      configFile: false,
      presets: [resolveModule('@babel/preset-typescript')],
      plugins: [resolveModule('@babel/plugin-transform-modules-commonjs')],
    })!.code!;
    fs.writeFileSync(path.join(dir, `${name}.js`), out);
  }
  const requires = modules.map((n) => `${JSON.stringify(n)}: require(${JSON.stringify(path.join(dir, `${n}.js`))})`).join(', ');
  return {
    run(tz: string, body: string): unknown {
      const script = `const m = { ${requires} }; process.stdout.write(JSON.stringify((() => { ${body} })()));`;
      const res = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
      if (res.status !== 0) throw new Error(res.stderr);
      return JSON.parse(res.stdout);
    },
  };
}
