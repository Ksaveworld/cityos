# Material Symbols asset record

- Source: https://github.com/google/material-design-icons
- Set: Material Symbols Rounded，`fill1` 填充款，24px
- 取文件命名：`symbols/web/<name>/materialsymbolsrounded/<name>_fill1_24px.svg`
- License: Apache License 2.0，原文见同目录 `LICENSE`。
- Use in CityOS: 地图 POI 形象化标识的字形（glyph）。

## 为什么用这套，而不是继续用 lucide

lucide 已经是本项目依赖，但它是**界面图标**：等宽描边、无填充、没有交通类符号
（没有红绿灯）。地图 POI 需要的是**填充实心字形**——放进彩色徽标里要在小尺寸下
还能认出来，描边款缩到 14px 就糊了。Material Symbols 的 fill1 款是为这个场景做的，
并且有 `traffic`、`local_fire_department`、`car_crash` 这类交通与应急符号。

分工：**lucide 管界面，Material Symbols 管地图**。不要在界面里引这套，也不要用
lucide 去画地图 POI。

## 已下载

| 文件 | 用途 |
|---|---|
| `local_fire_department.svg` | 消防站 |
| `local_hospital.svg` | 医院 / 接收点 |
| `ambulance.svg` | 医疗保障 / 急救点 |
| `local_police.svg` | 派出所 / 警务点 / 交警岗 |
| `videocam.svg` | 上游视频点位 |
| `traffic.svg` | 交通信号灯 |
| `block.svg` | 道路封闭 |
| `car_crash.svg` | 交通事故 |
| `emergency.svg` | 事件锚点 |
| `campaign.svg` | 上报来源（接报 / 市民 / 物业 / 巡查） |
| `fire_hydrant.svg` | 消火栓 |
| `night_shelter.svg` | 避难场所 |
| `door_open.svg` | 场馆出入口 |
| `groups.svg` | 安保集结点 |

映射表在 `src/components/dashboard/map/poiCatalog.ts`。

## 上色方式

SVG 本身是黑色字形，不直接 `<img>` 引用。徽标里用 CSS `mask-image` 把字形当蒙版，
颜色由 `background-color` 给——这样同一个文件既能画白字（实心徽标）也能画彩字
（待核实的空心徽标），不用为每种配色各存一份。

The assets are stored locally so the demo does not depend on CDN availability.
