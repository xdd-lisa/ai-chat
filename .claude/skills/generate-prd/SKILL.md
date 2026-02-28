---
name: generate-prd
description: Generate or edit PRD (Product Requirements Document) markdown files. Trigger on "生成/创建/写 + 需求文档/PRD/原型" to generate new docs, or "修改/更新/编辑 + 需求文档/PRD/原型" to open existing docs for editing.
---

# Generate PRD Document

Two modes: **create** (generate new PRD) and **edit** (open existing PRD for editing).

## Rule 1: Create Mode

Trigger when user's input contains a **create prefix** + **document keyword**.

**Create prefixes**: 生成、创建、新增、新加、写、做、出
**Document keywords**: 原型、PRD、需求文档、产品文档、产品需求、功能设计、需求设计、需求

Examples: "生成PRD"、"创建需求文档"、"写个产品需求"、"新增一份原型"

**Action**: Generate a new PRD document following the template, save to `Docs/` folder.

## Rule 2: Edit Mode

Trigger when user's input contains an **edit prefix** + **document keyword**.

**Edit prefixes**: 修改、更新、编辑、改、调整、完善
**Document keywords**: 原型、PRD、需求文档、产品文档、产品需求、功能设计、需求设计、需求

Examples: "修改需求文档"、"更新PRD"、"编辑一下原型"、"完善产品需求"

**Action**:
1. Fetch the doc list from `/api/docs`
2. Try to match a document name from the user's input (e.g., "修改用户积分兑换功能需求文档" matches "用户积分兑换功能.md")
3. If matched: call `/api/update-doc` with `{ filename, instructions }` — AI reads the existing document, applies the modification, streams back the updated content, and saves it to the file automatically
4. If no document name found in input: show the doc list for manual selection, linking to the browser editor at `/docs/{filename}`

## Workflow

1. **Read the PRD template**: Always read `Templates/PRD模板.md` first to get the latest template structure.
2. **Extract key info from user description**:
   - Product/feature name (used as filename)
   - Background & objectives
   - Functional scope
   - User stories
   - Business value
   - Any specific details the user provided
3. **Generate the document**:
   - Follow the template structure exactly
   - Fill in sections with content derived from the user's description
   - For sections where the user didn't provide info, keep the template placeholder or write "暂无"
   - Set `created` and `updated` dates to today's date
   - Set `status` to "草稿"
4. **Save the file**:
   - Path: `Docs/{主题名称}.md`
   - Filename should be the product/feature name in Chinese, concise and descriptive
   - If the file already exists, ask the user before overwriting

## Output Format

The generated document MUST follow this structure (from the template):

```markdown
---
title: "[PRD 标题]"
product: "[产品名称]"
version: v1.0
status: 草稿
author: "[作者姓名]"
created: "[YYYY-MM-DD]"
updated: "[YYYY-MM-DD]"
tags:
  - prd
  - product
---

# [PRD 标题]
# 1. 引言
## 1.1. *基本信息
## 1.2. *版本历史
## 1.3. *业务方一致性确认
## 1.4. 术语与缩写解释
## 1.5. *需求背景
## 1.6. 竞品调研
## 1.7. 用户调研
## 1.8. *业务价值
## 1.9. *范围
## 1.10. 参考资料

# 2. 需求概述
## 2.1. *产品概述
## 2.2. 产品架构图
### 2.2.1. *业务影响性分析
### 2.2.2. *复用性分析
## 2.3. 业务流程图
## 2.4. 页面流程图
## 2.5. 系统流程图
## 2.6. *产品功能
## 2.7. *产品角色权限

# 3. 功能一 功能标题
## 3.1. *用户故事
## 3.2. 流程图
## 3.3. 界面展示
## 3.4. *功能描述

# 4. 数据需求
## 4.1. 数据需求
## 4.2. 埋点需求

# 5. 其他
## 5.1. 信息化系统需求(BPM/Aris)
## 5.2. 灰度需求
## 5.3. 可用性需求
## 5.4. 性能需求
## 5.5. 安全需求
## 5.6. 兼容性需求
## 5.7. 业务监控告警需求
## 5.8. 验收案例
```

## Key Rules

- Always read the full template from `Templates/PRD模板.md` before generating, in case it has been updated.
- Keep all table structures from the template intact; fill in rows based on user input.
- For sections marked with `*` (required), always fill in content — use "暂无" if user didn't provide relevant info.
- For optional sections, include them but mark as "暂无" or leave placeholder if no info available.
- If the user describes multiple features, create a separate `# 3. 功能N` section for each.
- After generating, tell the user the file path and provide a brief summary of what was filled in vs. what needs manual completion.
