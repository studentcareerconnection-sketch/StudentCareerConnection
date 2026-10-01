# UCI Planner

A course-planning website for UC Irvine undergraduates. It scrapes official UCI data, builds a four-year plan, and checks prerequisites and degree requirements. Majors are presented as books on a 3D bookshelf.

UC Irvine 本科选课规划网站：抓取 UCI 官方数据，生成四年选课规划，检查先修课和毕业要求。所有专业以 3D 书架上的书来呈现。

---

## Quick start · 快速开始

The built site data is already in `web/public/data/`, so you can run the website without scraping anything:

网站要用的数据已经在 `web/public/data/` 里，不需要先抓取就能运行：

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

Requires Node.js 20.19+ or 22.12+ (Vite 8). The 3D pages load Three.js and fonts from a CDN, so an internet connection is needed.

需要 Node.js 20.19+ 或 22.12+（Vite 8 的要求）。3D 页面从 CDN 加载 Three.js 和字体，所以需要联网。

## Pages · 页面

| Route · 路径 | What it is | 说明 |
|---|---|---|
| `/` | **My shelf** — a bookcase with a *Progress* book (courses taken) plus every major/minor the student has chosen | **我的书架**：一本 *Progress*（已修课程），以及学生选的所有主修 / 辅修 |
| `/shelf` | **Major shelf** — every UCI major as a book, A–Z, with *Undecided* in the middle. Open *Undecided* to choose majors and minors; open any major to add it | **全部专业书架**：所有专业按字母排列，*Undecided* 在中间。打开 *Undecided* 选择主修和辅修，打开任意专业可直接添加 |
| `/roadmap` | Course roadmap: prerequisite graph of the courses your programs need | 课程路线图：所选专业需要的课程及先修关系 |
| `/plan` | Quarter-by-quarter planner, with an automatic plan generator | 按季度排课，可自动生成规划 |
| `/requirements` | Degree-requirement progress | 毕业要求进度 |
| `/setup` | Pick programs from a searchable list | 用列表搜索选择专业 |

The plan is saved in the browser (`localStorage`), so nothing is sent to a server.

规划保存在浏览器的 `localStorage` 里，不会上传到服务器。

## Updating the data · 更新数据

Only needed when UCI data changes (new term, new catalogue year). Scraping writes raw data to `data/` (about 200 MB, not committed); `build_web_data.py` turns it into the compact files in `web/public/data/`.

只有 UCI 数据变化时才需要（新学期、新一年的目录）。抓取把原始数据写到 `data/`（约 200 MB，不在仓库里），再由 `build_web_data.py` 整理成 `web/public/data/` 里的精简文件。

```bash
pip install -r requirements.txt
python scrape.py all                 # everything, ~10–15 min at 1 request/s · 抓取全部，约 10–15 分钟
python build_web_data.py             # data/ -> web/public/data/ · 生成网站数据
```

Individual scrapers · 单独抓取：

```bash
python scrape.py courses                          # all catalogue courses · 目录里的所有课程
python scrape.py anteater                         # degree requirements (Anteater API) · 毕业要求
python scrape.py programs                         # catalogue program pages · 专业页面（示例规划、后备要求）
python scrape.py prereqs                          # registrar prerequisite logic · 注册处先修课逻辑
python scrape.py websoc --list-terms              # list available terms · 列出可选学期
python scrape.py websoc --term 2026-92            # one term (default: current) · 指定学期（默认当前学期）
python scrape.py websoc --dept "I&C SCI" --dept COMPSCI
python scrape.py websoc --term all --cache-websoc # every term since 2021 (~2–3 h) · 2021 年起所有学期
```

- Catalogue, prerequisite and Anteater responses are cached in `.cache/`; add `--no-cache` to refresh.
  catalogue / 先修课 / Anteater 的响应缓存在 `.cache/`，加 `--no-cache` 强制刷新。
- WebSoc is **not** cached by default (seats and waitlists change constantly); use `--cache-websoc` while debugging the parser.
  WebSoc 默认**不**缓存（名额、候补一直在变），调试解析器时可加 `--cache-websoc`。
- Each new term · 每学期更新：
  `python scrape.py anteater --no-cache && python scrape.py websoc --term <new term> && python build_web_data.py`

## Data sources · 数据来源

| Raw file · 原始文件 | Source · 来源 | Contents · 内容 |
|---|---|---|
| `data/anteater/programs.json` | [Anteater API](https://anteaterapi.com) by ICSSC (from UCI DegreeWorks) | Structured requirement trees for 86 majors, 81 minors, 95 specializations, plus university-wide GE / UC requirements · 结构化毕业要求树，以及全校 GE / UC 要求 |
| `data/catalogue/courses.json` | catalogue.uci.edu/allcourses/ | Course number, title, units, description, GE category, prerequisite text · 课程号、名称、学分、描述、GE 类别、先修原文 |
| `data/catalogue/programs.json` | catalogue.uci.edu/undergraduatedegrees/ | Program pages and four-year sample plans; fallback requirements for programs Anteater lacks (parsed by `scrapers/requirements.py`) · 专业页面和四年示例规划；Anteater 缺少的专业用它做后备 |
| `data/prerequisites.json` | reg.uci.edu/cob/prrqcgi | Prerequisite **AND / OR trees** (minimum grades, coreqs, AP scores, "NO X" exclusions) · 先修课逻辑树 |
| `data/websoc/<term>.json` | reg.uci.edu/perl/WebSoc | Every section's time, place, instructor, capacity; used to infer which quarters a course is usually offered · 每个 section 的信息，用来推算开课季度 |

The website only reads the static files in `web/public/data/`; it never calls Anteater API or UCI websites at runtime.

网站只读 `web/public/data/` 里的静态文件，运行时**不会**调用 Anteater API 或 UCI 网站。

**Attribution · 署名：** Anteater API asks for credit. The sidebar shows "Degree requirements from Anteater API by ICSSC" — please keep it.
Anteater API 要求注明来源，侧边栏已有 "Degree requirements from Anteater API by ICSSC"，请保留。

### Requirement trees · 毕业要求树

`build_web_data.py` converts both Anteater and the catalogue fallback into one format (`scrapers/program_tree.py`):

`build_web_data.py` 把 Anteater 和 catalogue 后备统一成一种格式（`scrapers/program_tree.py`）：

```jsonc
{"type": "group",  "count": 4, "label": "Flexible Core Requirement", "children": [...]}   // satisfy 4 of these · 满足其中 4 项
{"type": "course", "count": 1, "label": "FA6: Algorithms", "courses": ["COMPSCI 162", "COMPSCI 163"]}
{"type": "units",  "count": 8, "label": "8 Units Of DRAMA 101", "courses": [...]}
{"type": "marker", "label": "Entry Level Writing"}                                         // ticked by hand · 学生手动勾选
```

`reusable: true` on a `course` / `units` node means the course may also count toward other requirements (e.g. CS 145 counts toward both the Flexible Core and the project requirement).

`course` / `units` 节点上的 `reusable: true` 表示这门课可以同时计入其他要求（例如 CS 145 同时计入 Flexible Core 和项目课）。

### Prerequisite trees · 先修课逻辑树

`I&C SCI 6N`: `( I&C SCI 31 OR I&C SCI 32A OR AP COMP SCI A ) AND NO MATH 3A`

```json
{"and": [
  {"or": [
    {"course": "I&C SCI 31", "min_grade": "D-", "coreq": false, "recommended": false},
    {"course": "I&C SCI 32A", "min_grade": "D-", "coreq": false, "recommended": false},
    {"exam": "AP COMP SCI A", "min_score": "3"}
  ]},
  {"not": "MATH 3A"}
]}
```

## Code layout · 代码结构

```
scrape.py, scrapers/        Python scrapers · 爬虫
build_web_data.py           raw data -> web/public/data · 生成网站数据
web/                        the website (Vite + React + TypeScript + Tailwind) · 网站
  src/pages/                route components · 各页面
  src/lib/                  planning logic, no UI · 规划逻辑（不含界面）
  src/shelf/                React side of the 3D shelves · 3D 书架的 React 部分
  public/landing-pages/     the 3D shelves (plain HTML + Three.js) · 3D 书架页面
  public/data/              built data the site loads · 网站读取的数据
```

| File · 文件 | Purpose | 作用 |
|---|---|---|
| `src/store.ts` | The plan (programs, completed courses, quarters), persisted to localStorage | 规划状态，自动存到 localStorage |
| `src/data.ts` | Loads and caches the JSON files in `public/data/` | 读取并缓存数据文件 |
| `src/lib/requirements.ts` | Requirement progress; suggests courses for open electives (prerequisites met, regularly offered first) | 计算毕业要求进度，为空缺的选修推荐课程 |
| `src/lib/roadmap.ts` | Plan generator: prerequisite order, coreqs in the same quarter, exclusions, offering quarters | 规划生成器：先修顺序、coreq 同季度、互斥课、开课季度 |
| `src/lib/prereq.ts` | Evaluates prerequisite trees (met / unmet / unknown) | 先修课逻辑树求值 |
| `src/lib/offerings.ts` | Infers usual offering quarters from WebSoc history since 2021 | 根据 2021 年起的 WebSoc 历史推测开课季度 |
| `src/pages/Planner.tsx` | Roadmap, quarter planner and requirements views | 路线图、季度规划、毕业要求三个视图 |
| `src/pages/Setup.tsx` | Program picker | 选择专业 |
| `src/pages/Home.tsx`, `src/pages/Shelf.tsx` | Host the two 3D shelves in an iframe | 用 iframe 承载两个 3D 书架 |
| `src/shelf/useShelfBridge.ts` | Syncs the shelves with the store over `postMessage` | 通过 `postMessage` 同步书架和规划状态 |
| `public/landing-pages/shelf-core.js` | Shared 3D book and bookcase construction (cloth, foil, pages, oak) | 共享的 3D 书本和书架构建代码 |
| `public/landing-pages/home-shelf.*` | My shelf (`/`) | 我的书架 |
| `public/landing-pages/major-shelf.*` | Major shelf (`/shelf`) | 全部专业书架 |

### How the 3D shelves work · 3D 书架的实现

The shelves are standalone HTML pages with Three.js r165, loaded in a same-origin iframe. The React app sends them the plan (`uci-shelf:state`), and they send back program changes (`uci-shelf:set-programs`) and navigation requests (`uci-shelf:navigate`). The store stays the single source of truth.

书架是独立的 HTML + Three.js 页面，放在同源 iframe 里。React 把规划状态发给书架（`uci-shelf:state`），书架把专业变更（`uci-shelf:set-programs`）和跳转请求（`uci-shelf:navigate`）发回来，状态只保存在 store 里一处。

Performance notes for integrated GPUs · 针对集成显卡的性能处理：
- The major shelf only builds the ~9 books near the reading position (a small cache), not all 90.
  全部专业书架只构建当前位置附近的约 9 本书，而不是全部 90 本。
- Rendering stops when nothing moves; the settled frame is redrawn at full resolution, and resolution drops only while animating.
  画面静止时停止渲染；停下后以完整分辨率重画一帧，只在动画过程中降低分辨率。
- Shadows update when the shelf settles; back covers, endpapers and inside pages are drawn only when a book is opened.
  阴影在书架停下时更新；封底、衬页和内页只在打开书时才生成。

## Credits · 致谢

- Degree requirements: [Anteater API](https://anteaterapi.com) by ICSSC.
- Course, program, prerequisite and schedule data: UC Irvine Catalogue, Registrar and WebSoc.
- The 3D shelf is adapted from the *Complete Shelf* landing page by [ThreeUI](https://threeui.com) (Working Volumes): its book construction, lighting and page-turning interaction, re-themed and extended for UCI programs.
  3D 书架改编自 [ThreeUI](https://threeui.com) 的 *Complete Shelf* 页面，保留了书本构造、灯光和翻页交互，针对 UCI 专业重新设计和扩展。
- [Three.js](https://threejs.org).

## Known limitations · 已知局限

- Requirements follow DegreeWorks, but this site's calculation is not an official degree audit — always confirm with DegreeWorks or an academic advisor.
  毕业要求以 DegreeWorks 为准，但本站计算不等于官方审核，请以 DegreeWorks / 学术顾问为准。
- Course-level conditions (`courseConstraints`, e.g. a minimum grade in a specific course) are not used yet.
  课程级别的附加条件（如某门课的最低成绩要求）暂未使用。
- GE requirements show progress only; GE courses are not auto-suggested.
  GE 只显示进度，不自动推荐课程。
- The registrar's prerequisite data still lists some retired course numbers (e.g. PSCI/PSYCH renamed to PSY in 2026); such prerequisites count as "unknown" and never block planning.
  注册处的先修课数据里有已停开的旧课号（如 2026 年 PSCI/PSYCH 改名为 PSY），这类条件按"无法判断"处理，不会阻塞排课。
- WebSoc titles are registrar abbreviations (e.g. `INTRO TO PROGRMMING`); full titles come from the catalogue.
  WebSoc 课程名是缩写（如 `INTRO TO PROGRMMING`），完整名称来自 catalogue。
- On the home shelf, only the *Progress* book opens so far; program books are placeholders.
  我的书架上目前只有 *Progress* 可以打开，专业的书暂时只是展示。
