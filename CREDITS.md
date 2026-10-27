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
| `public/assets/race/sky/*` | Alps Field（瑞士阿尔卑斯山谷，Andreas Mischok 摄）：16K HDR 按 ACES（曝光 0.85）色调映射后切成 8 块天空分块与 4K 预览；`alps_field_2k.hdr` 为光照与反射用 2K HDR | [Poly Haven](https://polyhaven.com/a/alps_field) | CC0 |
| `public/assets/race/tex/asphalt_track_*.webp` | asphalt_track（赛道柏油；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/asphalt_track) | CC0 |
| `public/assets/race/tex/asphalt_pit_lane_*.webp` | asphalt_pit_lane（起终点区柏油；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/asphalt_pit_lane) | CC0 |
| `public/assets/race/tex/gravelly_sand_*.webp` | gravelly_sand（沙地缓冲区；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/gravelly_sand) | CC0 |
| `public/assets/race/tex/red_sand_*.webp` | red_sand（红沙；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/red_sand) | CC0 |
| `public/assets/race/tex/sandy_gravel_02_*.webp` | sandy_gravel_02（路肩外碎石沙；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/sandy_gravel_02) | CC0 |
| `public/assets/race/tex/mud_cracked_dry_03_*.webp` | mud_cracked_dry_03（盐湖龟裂地；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/mud_cracked_dry_03) | CC0 |
| `public/assets/race/tex/dry_mud_field_001_*.webp` | dry_mud_field_001（盐湖平地；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/dry_mud_field_001) | CC0 |
| `public/assets/race/tex/cliff_side_*.webp` | cliff_side（台地岩壁；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/cliff_side) | CC0 |
| `public/assets/race/tex/tiger_rock_*.webp` | tiger_rock（红岩条纹；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/tiger_rock) | CC0 |
| `public/assets/race/tex/worn_rock_natural_01_*.webp` | worn_rock_natural_01（砂岩；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/worn_rock_natural_01) | CC0 |
| `public/assets/race/tex/dry_riverbed_rock_*.webp` | dry_riverbed_rock（峡谷河床；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/dry_riverbed_rock) | CC0 |
| `public/assets/race/tex/brushed_concrete_*.webp` | brushed_concrete（隧道与水泥；1K 颜色、法线、粗糙度转 WebP） | [Poly Haven](https://polyhaven.com/a/brushed_concrete) | CC0 |
| `public/assets/race/props/namaqualand_cliff_01.glb` | namaqualand_cliff_01（岩壁1；meshopt 压缩，贴图转 WebP 1024） | [Poly Haven](https://polyhaven.com/a/namaqualand_cliff_01) | CC0 |
| `public/assets/race/props/namaqualand_cliff_02.glb` | namaqualand_cliff_02（岩壁2；meshopt 压缩，贴图转 WebP 1024） | [Poly Haven](https://polyhaven.com/a/namaqualand_cliff_02) | CC0 |
| `public/assets/race/props/rock_face_01.glb` | rock_face_01（岩面1；meshopt 压缩，贴图转 WebP 1024） | [Poly Haven](https://polyhaven.com/a/rock_face_01) | CC0 |
| `public/assets/race/props/mountainside.glb` | mountainside（山体；meshopt 压缩，贴图转 WebP 1024） | [Poly Haven](https://polyhaven.com/a/mountainside) | CC0 |
| `public/assets/race/props/namaqualand_boulder_02.glb` | namaqualand_boulder_02（巨石2；meshopt 压缩，贴图转 WebP 1024） | [Poly Haven](https://polyhaven.com/a/namaqualand_boulder_02) | CC0 |
| `public/assets/race/props/namaqualand_boulder_04.glb` | namaqualand_boulder_04（巨石4；meshopt 压缩，贴图转 WebP 1024） | [Poly Haven](https://polyhaven.com/a/namaqualand_boulder_04) | CC0 |
| `public/assets/race/props/namaqualand_boulder_05.glb` | namaqualand_boulder_05（巨石5；meshopt 压缩，贴图转 WebP 1024） | [Poly Haven](https://polyhaven.com/a/namaqualand_boulder_05) | CC0 |
| `public/assets/race/props/namaqualand_boulders_01.glb` | namaqualand_boulders_01（巨石群；meshopt 压缩，贴图转 WebP 1024） | [Poly Haven](https://polyhaven.com/a/namaqualand_boulders_01) | CC0 |
| `public/assets/race/props/namaqualand_rocks_01.glb` | namaqualand_rocks_01（碎岩；meshopt 压缩，贴图转 WebP 1024） | [Poly Haven](https://polyhaven.com/a/namaqualand_rocks_01) | CC0 |
| `public/assets/race/props/quiver_tree_01.glb` | quiver_tree_01（箭袋树1；meshopt 压缩，贴图转 WebP 1024） | [Poly Haven](https://polyhaven.com/a/quiver_tree_01) | CC0 |
| `public/assets/race/props/quiver_tree_02.glb` | quiver_tree_02（箭袋树2；meshopt 压缩，贴图转 WebP 512） | [Poly Haven](https://polyhaven.com/a/quiver_tree_02) | CC0 |
| `public/assets/race/props/othonna_cerarioides.glb` | othonna_cerarioides（肉质小树；meshopt 压缩，贴图转 WebP 512） | [Poly Haven](https://polyhaven.com/a/othonna_cerarioides) | CC0 |
| `public/assets/race/props/wild_rooibos_bush.glb` | wild_rooibos_bush（路易波士灌木；meshopt 压缩，贴图转 WebP 512） | [Poly Haven](https://polyhaven.com/a/wild_rooibos_bush) | CC0 |
| `public/assets/race/props/cheiridopsis_succulent.glb` | cheiridopsis_succulent（多肉；meshopt 压缩，贴图转 WebP 512） | [Poly Haven](https://polyhaven.com/a/cheiridopsis_succulent) | CC0 |
| `public/assets/race/props/concrete_road_barrier.glb` | concrete_road_barrier（水泥墩；meshopt 压缩，贴图转 WebP 512） | [Poly Haven](https://polyhaven.com/a/concrete_road_barrier) | CC0 |
| `public/assets/race/props/concrete_road_barrier_02.glb` | concrete_road_barrier_02（水泥墩2；meshopt 压缩，贴图转 WebP 512） | [Poly Haven](https://polyhaven.com/a/concrete_road_barrier_02) | CC0 |
| `public/assets/race/props/old_tyre.glb` | old_tyre（旧轮胎；meshopt 压缩，贴图转 WebP 512） | [Poly Haven](https://polyhaven.com/a/old_tyre) | CC0 |
| `public/assets/race/props/modular_electricity_poles.glb` | modular_electricity_poles（电线杆；meshopt 压缩，贴图转 WebP 512） | [Poly Haven](https://polyhaven.com/a/modular_electricity_poles) | CC0 |
| `public/assets/race/props/modular_chainlink_fence.glb` | modular_chainlink_fence（铁丝网；meshopt 压缩，贴图转 WebP 512） | [Poly Haven](https://polyhaven.com/a/modular_chainlink_fence) | CC0 |

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
