# 素材致谢

本项目的 3D 模型、环境贴图等第三方素材及其授权如下。

## 3D 模型

| 文件 | 素材 | 作者 | 授权 | 改动 |
| --- | --- | --- | --- | --- |
| `public/assets/models/roadster-2020.glb` | [Tesla Roadster 2020](https://sketchfab.com/3d-models/tesla-roadster-2020-1fbf29e297bd4a17ac39a00a378441d8)（经 [AbduSalam08/3dModel-Tesla-Roadster](https://github.com/AbduSalam08/3dModel-Tesla-Roadster) 获取） | [metarex.4d](https://sketchfab.com/metarex.4d) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | meshopt 压缩、贴图转 WebP（1024）；运行时改为黑白涂装 |
| `public/assets/models/roadster-2008.glb` | [2008 Tesla Roadster](https://sketchfab.com/3d-models/2008-tesla-roadster-317dabbe5e824948a92091f7bd39c2de) | [the_86_guy](https://sketchfab.com/the_86_guy) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | meshopt 压缩、贴图转 WebP（1024） |

## 环境与贴图

| 文件 | 素材 | 来源 | 授权 |
| --- | --- | --- | --- |
| `public/assets/hdri/goegap_road_2k.hdr` | Goegap Road（光照与反射用 2K HDR） | [Poly Haven](https://polyhaven.com/a/goegap_road) | CC0 |
| `public/assets/hdri/goegap_bg_8k.jpg`、`goegap_front_16k.jpg` | Goegap Road 16K HDR 经 ACES（曝光 0.85）色调映射后，导出 8K 全景背景与前方 16K 精度高清块 | [Poly Haven](https://polyhaven.com/a/goegap_road) | CC0 |
| `public/assets/tex/asphalt_02_*.webp` | Asphalt 02（转为 1K WebP） | [Poly Haven](https://polyhaven.com/a/asphalt_02) | CC0 |
| `public/assets/tex/dry_ground_rocks_*.webp` | Dry Ground Rocks（转为 1K WebP） | [Poly Haven](https://polyhaven.com/a/dry_ground_rocks) | CC0 |
| `public/assets/tex/grass_ground_diff.webp` | Grass Ground 干草地（1K 颜色贴图转 WebP，用于车旁地面细节） | [Poly Haven](https://polyhaven.com/a/grass_ground) | CC0 |
| `public/assets/tex/aerial_grass_rock_diff.webp` | Aerial Grass Rock 航拍草地碎石（1K 颜色贴图转 WebP，用于高空俯瞰的地面） | [Poly Haven](https://polyhaven.com/a/aerial_grass_rock) | CC0 |
| `public/assets/props/didelta_spinosa.glb` | Didelta Spinosa 灌木（网格精简到约 5%，meshopt 压缩） | [Poly Haven](https://polyhaven.com/a/didelta_spinosa) | CC0 |
| `public/assets/props/boulder_01.glb` | Boulder 01 石头（网格精简，meshopt 压缩） | [Poly Haven](https://polyhaven.com/a/boulder_01) | CC0 |
| `public/assets/props/dead_quiver_trunk.glb` | Dead Quiver Trunk 枯树干（meshopt 压缩） | [Poly Haven](https://polyhaven.com/a/dead_quiver_trunk) | CC0 |
| `public/assets/earth/bm_surface_8k.jpg`、`bm_patch_eastasia.jpg` | Blue Marble Next Generation（2004 年 7 月，地形与海底地形版，21600×10800），缩放为 8K 全球图并裁出东亚高清块 | [NASA Earth Observatory](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry) | NASA 影像，公有领域 |
| `public/assets/earth/earth_bump_roughness_clouds_4096.jpg`、`earth_night_4096.jpg` | 云层、夜间灯光贴图 | [three.js 示例贴图](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets)，源自 NASA 公开影像 | 见 three.js 仓库说明；NASA 影像为公有领域 |

## 竞速赛道「阿尔卑斯环线」

| 文件 | 素材 | 来源 | 授权 |
| --- | --- | --- | --- |
| `public/assets/race/sky/sunset/*` | Kloppenheim 06 (Pure Sky)：16K HDR 按 ACES（曝光 0.85）色调映射后切成 8 块天空分块与 4K 预览；`env_2k.hdr` 为光照与反射用 2K HDR | [Poly Haven](https://polyhaven.com/a/kloppenheim_06_puresky) | CC0 |
| `public/assets/race/sky/dawn/*` | Kiara 1 Dawn，同上方式烘焙 | [Poly Haven](https://polyhaven.com/a/kiara_1_dawn) | CC0 |
| `public/assets/race/tex/asphalt_track_*.webp` | asphalt_track（赛道柏油；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/asphalt_track) | CC0 |
| `public/assets/race/tex/cliff_side_*.webp` | cliff_side（台地岩壁；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/cliff_side) | CC0 |
| `public/assets/race/tex/brushed_concrete_*.webp` | brushed_concrete（隧道与水泥；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/brushed_concrete) | CC0 |
| `public/assets/race/props/concrete_road_barrier.glb` | concrete_road_barrier（水泥墩；meshopt 压缩，贴图转 WebP 512） | [Poly Haven](https://polyhaven.com/a/concrete_road_barrier) | CC0 |
| `public/assets/race/props/old_tyre.glb` | old_tyre（旧轮胎；meshopt 压缩，贴图转 WebP 512） | [Poly Haven](https://polyhaven.com/a/old_tyre) | CC0 |

### 阿尔卑斯草甸与针叶林补充素材

所有以下素材来自 Poly Haven，采用 CC0 授权。贴图转换为 WebP，模型经压缩适配实时场景。

| 本地素材 | 来源与授权 |
| --- | --- |
| `public/assets/race/tex/rocks_ground_02_*.webp` | [Poly Haven · rocks_ground_02](https://polyhaven.com/a/rocks_ground_02) · CC0 |
| `public/assets/race/tex/grass_path_2_*.webp` | [Poly Haven · grass_path_2](https://polyhaven.com/a/grass_path_2) · CC0 |
| `public/assets/race/tex/forrest_ground_01_*.webp` | [Poly Haven · forrest_ground_01](https://polyhaven.com/a/forrest_ground_01) · CC0 |
| `public/assets/race/tex/rock_face_03_*.webp` | [Poly Haven · rock_face_03](https://polyhaven.com/a/rock_face_03) · CC0 |
| `public/assets/race/tex/mossy_rock_*.webp` | [Poly Haven · mossy_rock](https://polyhaven.com/a/mossy_rock) · CC0 |
| `public/assets/race/props/fir_tree_01.glb` | [Poly Haven · fir_tree_01](https://polyhaven.com/a/fir_tree_01) · CC0 |
| `public/assets/race/props/pine_sapling_medium.glb`（减面至约 2%） | [Poly Haven · pine_sapling_medium](https://polyhaven.com/a/pine_sapling_medium) · CC0 |
| `public/assets/race/props/rock_moss_set_01.glb` | [Poly Haven · rock_moss_set_01](https://polyhaven.com/a/rock_moss_set_01) · CC0 |
| `public/assets/race/props/rock_07.glb` | [Poly Haven · rock_07](https://polyhaven.com/a/rock_07) · CC0 |
| `public/assets/race/props/rock_09.glb` | [Poly Haven · rock_09](https://polyhaven.com/a/rock_09) · CC0 |
| `public/assets/race/props/shrub_02.glb` | [Poly Haven · shrub_02](https://polyhaven.com/a/shrub_02) · CC0 |
| `public/assets/race/props/tree_stump_01.glb` | [Poly Haven · tree_stump_01](https://polyhaven.com/a/tree_stump_01) · CC0 |
| `public/assets/race/props/pine_tree_01.glb`（减面至约 2%，meshopt 压缩） | [Poly Haven · pine_tree_01](https://polyhaven.com/a/pine_tree_01) · CC0 |
| `public/assets/race/props/fir_sapling_medium.glb`（已减面，meshopt 压缩） | [Poly Haven · fir_sapling_medium](https://polyhaven.com/a/fir_sapling_medium) · CC0 |
| `public/assets/race/props/stone_01.glb`（meshopt 压缩） | [Poly Haven · stone_01](https://polyhaven.com/a/stone_01) · CC0 |
| `public/assets/race/props/shrub_04.glb`（meshopt 压缩） | [Poly Haven · shrub_04](https://polyhaven.com/a/shrub_04) · CC0 |
| `public/assets/race/props/dead_tree_trunk_02.glb`（meshopt 压缩） | [Poly Haven · dead_tree_trunk_02](https://polyhaven.com/a/dead_tree_trunk_02) · CC0 |
| `public/assets/race/props/concrete_road_barrier_02.glb`（meshopt 压缩） | [Poly Haven · concrete_road_barrier_02](https://polyhaven.com/a/concrete_road_barrier_02) · CC0 |
| `public/assets/race/props/rock_face_01.glb`（meshopt 压缩） | [Poly Haven · rock_face_01](https://polyhaven.com/a/rock_face_01) · CC0 |
| `public/assets/race/props/mountainside.glb`（meshopt 压缩） | [Poly Haven · mountainside](https://polyhaven.com/a/mountainside) · CC0 |
| `public/assets/race/props/modular_electricity_poles.glb`（meshopt 压缩） | [Poly Haven · modular_electricity_poles](https://polyhaven.com/a/modular_electricity_poles) · CC0 |
| `public/assets/race/props/modular_chainlink_fence.glb`（meshopt 压缩） | [Poly Haven · modular_chainlink_fence](https://polyhaven.com/a/modular_chainlink_fence) · CC0 |

## 星空

| 文件 | 素材 | 来源 | 授权 |
| --- | --- | --- | --- |
| `public/assets/sky/stars_8k.jpg` | Deep Star Maps 2020（Hipparcos-2、Tycho-2、Gaia DR2 星表与银河），16K EXR 线性亮度 ×4 后转 8K sRGB | [NASA/Goddard Space Flight Center Scientific Visualization Studio](https://svs.gsfc.nasa.gov/4851) | NASA 影像，公有领域（致谢 NASA/GSFC SVS） |

## 音乐

| 文件 | 曲目 | 作者 | 来源 | 授权 |
| --- | --- | --- | --- | --- |
| `public/assets/music/road-80s-synthwave.mp3` | 80S Synthwave（公路驾驶） | AtlasAudio | [Pixabay](https://pixabay.com/music/synthwave-80s-synthwave-617535/) | [Pixabay Content License](https://pixabay.com/service/license-summary/) |
| `public/assets/music/space-cosmos.mp3` | Cosmos（起飞到太空） | The_Mountain | [Pixabay](https://pixabay.com/music/ambient-cosmos-587577/) | Pixabay Content License |
| `public/assets/music/oldfriend-reflected-light.mp3` | Reflected Light（与老前辈同框） | SergePavkinMusic | [Pixabay](https://pixabay.com/music/beautiful-plays-reflected-light-147979/) | Pixabay Content License |
| `public/assets/music/lobby-rock.m4a` | Action Race Rock Music（多人房间大厅，转码为 128 kbps AAC） | magpiemusic | [Pixabay](https://pixabay.com/music/rock-action-race-rock-music-513682/) | Pixabay Content License |

Pixabay Content License 允许免费商用、无需署名；此处署名以示感谢。

## 自制素材

| 文件 | 内容 | 来源 |
| --- | --- | --- |
| `public/assets/props/coin-face.webp` | 金币币面浮雕（跑车沿弧线冲向星空） | 本项目用 OpenAI 图像生成工具制作的原创图案，经裁切、调亮后使用 |

## 开源库

| 库 | 授权 |
| --- | --- |
| [three.js](https://threejs.org/) | MIT |
| [Vite](https://vite.dev/) | MIT |

## 声明

本项目是独立的非商业粉丝致敬作品，与 Tesla、SpaceX 无任何关联，也未获其认可或赞助。车型外观、商标与车标归其权利人所有，仅用于致敬展示。如权利人提出异议，将及时调整或下架。
