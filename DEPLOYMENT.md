# RainMark 智能书签管理插件 - 部署指南

## 📦 项目概述

RainMark 是一个功能强大的 Chrome 浏览器扩展，提供智能化的书签管理功能。它通过人工智能技术自动分类书签、推荐相关内容，并提供多种优化工具，让您的书签管理更加高效。

## 🚀 快速部署

### 前提条件
- Google Chrome 浏览器 88+
- Git
- 基本的命令行操作知识

### 步骤 1：克隆仓库
```bash
git clone git@github.com:08820048/RainMark.git
cd RainMark
```

### 步骤 2：安装扩展
1. 打开 Chrome 浏览器
2. 在地址栏输入：`chrome://extensions/`
3. 开启右上角的 **"开发者模式"** 开关
4. 点击左上角的 **"加载已解压的扩展程序"** 按钮
5. 选择 RainMark 项目文件夹
6. 点击 **"选择文件夹"**

### 步骤 3：验证安装
1. 在扩展程序页面中，确保 RainMark 扩展已启用
2. 在 Chrome 工具栏中应该能看到 RainMark 的图标
3. 点击图标打开弹出窗口，测试基本功能

## 🔧 开发环境设置

### 本地开发
```bash
# 1. 克隆项目
git clone git@github.com:08820048/RainMark.git
cd RainMark

# 2. 检查项目结构
ls -la

# 3. 在 Chrome 中加载扩展（开发者模式）
# 每次代码修改后，点击扩展的"刷新"按钮即可生效
```

### 文件结构说明
```
RainMark/
├── manifest.json          # 扩展配置文件
├── background.js         # 后台服务脚本
├── popup.html           # 弹出窗口界面
├── popup.js             # 弹出窗口逻辑
├── options.html         # 设置页面界面
├── options.js           # 设置页面逻辑
├── styles.css           # 全局样式文件
├── icons/               # 图标资源
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── docs/                # 文档
│   └── 需求文档.md
├── README.md            # 项目说明文档
├── INSTALL.md           # 安装指南
├── DEPLOYMENT.md        # 部署指南（本文档）
├── package.json         # 项目配置
└── .gitignore           # Git忽略文件
```

## 📱 功能测试

### 自动化测试
项目包含一个测试页面，可用于验证扩展功能：

1. 在 Chrome 中打开 `test.html`
2. 点击各个测试按钮验证功能
3. 查看控制台日志了解测试结果

### 手动测试清单
- [ ] 自动分类功能：添加新书签，检查是否自动分类
- [ ] 搜索功能：在弹出窗口中搜索书签
- [ ] 推荐功能：浏览网页时查看相关推荐
- [ ] 清理功能：测试重复书签清理
- [ ] 设置页面：验证设置保存和加载
- [ ] 数据导出：测试书签导出功能

## 🚢 生产部署

### Chrome 网上应用店发布
要将扩展发布到 Chrome 网上应用店，需要：

1. **准备发布包**
   ```bash
   # 创建发布包
   zip -r raimark-v1.0.0.zip . -x "*.git*" "node_modules/*" "*.DS_Store"
   ```

2. **开发者账号**
   - 注册 Chrome 开发者账号（一次性费用 $5）
   - 访问 [Chrome 开发者控制台](https://chrome.google.com/webstore/devconsole)

3. **提交审核**
   - 上传 ZIP 文件
   - 填写扩展信息
   - 提交审核（通常需要几天时间）

### 版本管理
```bash
# 1. 更新版本号
# 修改 manifest.json 中的 version 字段
# 修改 package.json 中的 version 字段

# 2. 创建发布标签
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# 3. 生成更新日志
# 基于 git log 创建 CHANGELOG.md
```

## 🔐 安全注意事项

### 权限管理
扩展使用了以下 Chrome API 权限：
- `bookmarks`: 必需，用于书签操作
- `storage`: 必需，用于保存设置
- `tabs`: 可选，用于智能推荐
- `history`: 可选，用于推荐算法优化
- `notifications`: 可选，用于用户通知
- `alarms`: 可选，用于定时任务

### 数据安全
- 所有用户数据存储在本地 Chrome 存储中
- 不收集个人身份信息
- 导出数据为 JSON 格式，不包含敏感信息

### 隐私保护
- 浏览历史仅用于本地推荐算法
- 不向任何服务器发送用户数据
- 用户可以随时禁用特定功能

## 🛠️ 故障排除

### 常见问题

#### 问题 1：扩展无法加载
**解决方案**：
1. 检查 `manifest.json` 格式是否正确
2. 确保所有文件路径正确
3. 查看 Chrome 开发者工具控制台错误

#### 问题 2：权限被拒绝
**解决方案**：
1. 重新安装扩展
2. 确保授予所有必要权限
3. 检查 Chrome 扩展设置

#### 问题 3：功能不工作
**解决方案**：
1. 刷新扩展（在扩展页面点击刷新按钮）
2. 检查控制台错误信息
3. 验证 Chrome 版本是否兼容

### 调试技巧
```javascript
// 在 background.js 中添加调试日志
console.log('RainMark: Function called', data);

// 在 popup.js 中检查元素
console.log('DOM elements:', document.getElementById('elementId'));

// 检查 Chrome API 错误
if (chrome.runtime.lastError) {
  console.error('Chrome API error:', chrome.runtime.lastError);
}
```

## 📈 监控和维护

### 性能监控
- 使用 Chrome 任务管理器监控扩展内存使用
- 定期检查控制台错误日志
- 监控扩展响应时间

### 用户反馈
- 收集用户通过选项页面提交的反馈
- 监控 Chrome 网上应用店用户评价
- 建立 GitHub Issues 收集问题报告

### 定期维护
1. **每月检查**
   - 更新依赖项
   - 检查 Chrome API 变更
   - 审查错误日志

2. **季度更新**
   - 功能改进
   - 性能优化
   - 安全更新

3. **年度审查**
   - 架构评估
   - 技术栈更新
   - 路线图规划

## 🔄 更新流程

### 小版本更新（1.0.x）
```bash
# 1. 修复 bug 或改进功能
# 2. 更新版本号
# 3. 提交更改
git add .
git commit -m "fix: 修复xxx问题"
git push

# 4. 创建新标签
git tag -a v1.0.1 -m "修复版本"
git push origin v1.0.1
```

### 大版本更新（1.x.0）
```bash
# 1. 创建新分支
git checkout -b feature/new-feature

# 2. 开发新功能
# 3. 测试和验证
# 4. 合并到主分支
git checkout main
git merge feature/new-feature

# 5. 发布新版本
git tag -a v1.1.0 -m "新功能版本"
git push origin v1.1.0
```

## 📞 支持与联系

### 获取帮助
- **GitHub Issues**: 报告 bug 或请求功能
- **文档**: 查看 README.md 和 INSTALL.md
- **测试**: 使用 test.html 进行功能验证

### 贡献指南
1. Fork 项目仓库
2. 创建功能分支
3. 提交更改
4. 创建 Pull Request

### 联系方式
- 项目主页: https://github.com/08820048/RainMark
- 问题反馈: GitHub Issues
- 功能建议: GitHub Discussions

---

**部署完成！** 🎉

RainMark 扩展现已成功部署。如果您遇到任何问题或有改进建议，请随时联系我们。

祝您使用愉快！ 🚀