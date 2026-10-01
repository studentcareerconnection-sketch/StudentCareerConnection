# UCI Planner — web

The website for UCI Planner (Vite + React + TypeScript + Tailwind). See the [project README](../README.md) for what it does, the page list and the code layout.

UCI Planner 的网站部分。功能、页面和代码结构见[项目 README](../README.md)。

```bash
npm install
npm run dev       # development server · 开发服务器: http://localhost:5173
npm run build     # type-check and build to dist/ · 类型检查并打包到 dist/
npm run lint      # oxlint
```

- `src/` — React app (planner, program picker, shelf hosts) · React 应用
- `public/landing-pages/` — the 3D shelves (plain HTML + Three.js) · 3D 书架页面
- `public/data/` — data built by `../build_web_data.py` · 由 `../build_web_data.py` 生成的数据
