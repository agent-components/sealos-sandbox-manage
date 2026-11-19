---
name: listpage
description: >-
  用 listpage-components 的 ListPage 做后台列表、筛选、分页和行操作。
  在编写或修改 ListPage、列表页、用户管理等页面时先读本技能，并按其中已确认的规则实现。
---

# ListPage

用 `listpage-components` 的 `ListPage` 做后台列表。组件类型在包内 `dist/components/ListPage/index.d.ts`。

## 协作

用户纠正用法时：

1. 先改页面代码。
2. 把确认过的做法写成一条规则，补进下面的「已确认」。
3. 删掉被否定的写法，不要两种做法并列。

规则只记录用户确认过的内容。

## 已确认

列表配置放在页面旁的 `config/`，不要写进页面文件。参考 `apps/web/src/pages/users/config/`：

- `filters.tsx`：传给 `filter`。
- `columns.tsx`：传给 `table.columns`。行内打开浮层用 `ctx.showFloat`，刷新用 `ctx.refreshTable`。
- `floats.tsx`：传给 `float.floats`。新建调用 `showFloat(key)`，编辑传入当前行。保存成功后 `onClose(true)`。
- `request.ts`：传给 `request`。把 ListPage 的 `page`、`filters` 和 `sort` 原样传给后端。请求失败不要在页面里捕获，由 tRPC 客户端用 antd 的 `notification.error` 统一弹出。
- 页面文件只组装 `ListPage`。
- 列表接口入参跟 listpage 对齐：`page: { current, pageSize }`、`filters`、`sort?: { field?: string; order?: 'ascend' | 'descend' | null }`。未排序时按创建时间倒序。
- 界面右上角的按钮用图标加文案。
- 组件放在页面旁的 `components/`，例如 `apps/web/src/pages/users/components/UserFormFloat.tsx`。`floats.tsx` 只是配置入口。
- 启用 / 停用这类状态列放在第一列，用 `Switch size="small"` 呈现，点击直接切换并刷新列表。编辑表单里不要出现这个字段；新建默认启用，编辑时保留原状态。参考 `apps/web/src/pages/components/config/columns.tsx`。
- 表单简短用 `FormModal`，字段多或内容长用 `ProDrawer`。例如令牌名称用 Modal（`apps/web/src/pages/mcp-tokens/components/McpTokenFormFloat.tsx`），用户 / 组件表单用 Drawer。
- 组件市场不用 Table。`filter` 和 `table` 都传 `render`：标题与上架数量同一行，左侧是安装状态下拉，右侧是搜索框；下面是卡片墙。卡片左侧图标，名称旁放 Key 和已安装标签，正文写菜单数和工具数，右下角是安装或卸载。点击「菜单」「工具」数字弹出详情，分别复用组件管理里的 `ComponentMenusPreview` 和 `ComponentToolsPreview`。卡片放在 `pages/market/components/`。
- 本仓库沙箱列表可用 `table.render` 挂带批量工具栏的表格；模板列表用卡片墙 `table.render`；调用日志用标准 `table.columns`。
