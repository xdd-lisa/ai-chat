---
name: generate-prd
description: Generate PRD (Product Requirements Document) markdown files based on user descriptions. Use when the user mentions keywords like 原型, PRD, 需求文档, 产品文档, 产品需求, 功能设计, or asks to create a product requirements document.
---

# Generate PRD Document

When triggered, generate a PRD markdown document following the project template, and save it to the `Docs/` folder.

## Trigger Keywords

Activate this skill when the user's input contains any of:
原型, PRD, 需求文档, 产品文档, 产品需求, 功能设计, 需求设计, 写个需求, 写个PRD, 生成文档

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
