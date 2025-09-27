// server/prisma/client.js
// ESM/Windows/Node 22 でも安全に動く Prisma クライアントのラッパ。
// - @prisma/client が未生成でも起動できるよう安全にフォールバック。
// - DB未使用ならモックで no-op 動作。実DBを使うなら `npx prisma generate` 後に本物へ自動切替。

/** 何でも no-op を返す超安全モック */
function createPrismaMock() {
  const noop = async () => null;
  return new Proxy(
    { $connect: noop, $disconnect: noop, $on: () => {} },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return new Proxy(() => {}, { apply: () => Promise.resolve(null), get: () => noop });
      },
    }
  );
}

let PrismaClientClass = null;
let prismaInstance = null;

// ESM で安全な動的 import（失敗しても落とさない）
try {
  const mod = await import('@prisma/client').catch(() => null);
  const pkg = mod?.default ?? mod;
  if (pkg && pkg.PrismaClient) PrismaClientClass = pkg.PrismaClient;
} catch (_) { /* ignore */ }

// 開発の多重生成を防ぐ（nodemon 対策）
const g = globalThis;

if (PrismaClientClass) {
  prismaInstance =
    g.__prisma__ ??
    new PrismaClientClass({
      log: (process.env.PRISMA_LOG || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
  if (process.env.NODE_ENV !== 'production') g.__prisma__ = prismaInstance;
} else {
  if (!g.__prisma_mock__) {
    console.warn(
      '[prisma] @prisma/client を読み込めませんでした。モックを使用します。\n' +
      '          DB を使う場合は `npm i -D prisma && npm i @prisma/client && npx prisma generate` を実行してください。'
    );
    g.__prisma_mock__ = createPrismaMock();
  }
  prismaInstance = g.__prisma_mock__;
}

export default prismaInstance;
export { PrismaClientClass as PrismaClient, prismaInstance as prisma };
