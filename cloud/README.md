# 小小世界 · 云端版（M1 账号与空间绑定）

## 两种模式
- **预览模式（默认）**：未配置时自动启用。注册/登录/创建空间/邀请码加入，数据只存本机浏览器，方便先体验流程。
- **云端模式**：配置 config.js 后自动切换，走 Supabase 真实账号与数据库。

## 怎么预览
浏览器打开：http://localhost:8080/cloud/index.html
用两个「无痕窗口」（或两台设备）各注册一个账号，一个创建空间拿到邀请码，另一个输入邀请码加入。

## 连接真云端（上线前）
1. 注册 Supabase：https://supabase.com（用 2732055594@qq.com）
2. 新建项目 → 记下 Project URL 和 anon public key
3. 打开 SQL Editor，把 schema.sql 整段粘贴执行
4. 复制 config.example.js 为 config.js，填入 URL 和 key
5. 刷新页面 → 右上提示「已连接云端」

## 部署到 Vercel（M5 再做也行）
1. 注册 GitHub，把本项目推到仓库
2. 注册 Vercel（可用 GitHub 登录）→ Import 仓库 → Deploy
3. 免费地址形如 xxx.vercel.app

> 注意：config.js 已被 .gitignore 忽略，密钥不会上传。
