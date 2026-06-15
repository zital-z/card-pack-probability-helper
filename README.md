# 卡包直播间刺盒下注概率助手

一个纯前端 React + TypeScript Web App，用来在直播间连续记录开包结果，并估算 19 个 SSR 角色下一包的刺盒命中概率。

## 功能

- 连续录入每包的 SSR 角色、金银、UR、QTR、ER、SP 和备注
- 19 个角色按角色聚合统计，不区分金银卡面
- 自动计算 Top 候选、有效命中率、期望成本和购买包数中盒概率
- 显示全部角色概率表和最近 50 包 SSR 频率
- 使用 localStorage 本地保存
- 支持 CSV 导入和导出，方便换设备

所有结果都是估算值，不是官方概率，也不是收益承诺。

## 本地运行

```bash
npm install
npm run dev
```

打开终端显示的地址，例如：

```text
http://localhost:5173/
```

如果平板和电脑在同一个 Wi-Fi，可以打开终端里显示的 Network 地址，例如：

```text
http://192.168.x.x:5173/
```

电脑需要保持运行。

## 部署到 Vercel

1. 把代码推送到 GitHub。
2. 登录 [Vercel](https://vercel.com/)。
3. 选择 `Add New Project`。
4. 选择这个 GitHub 仓库。
5. Framework Preset 选 `Vite`。
6. Build Command 保持 `npm run build`。
7. Output Directory 保持 `dist`。
8. 点击 Deploy。

部署完成后，手机、平板、电脑都可以通过 Vercel 网址访问。

## 数据说明

当前版本的数据保存在当前设备的浏览器里。不同设备之间不会自动同步。

换设备时可以：

1. 在旧设备点击“导出CSV”。
2. 在新设备打开网页。
3. 粘贴 CSV 内容后点击“导入粘贴内容”。

## 开发命令

```bash
npm run lint
npm run build
```
