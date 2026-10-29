// 全部手感参数集中于此；单位采用米、秒、弧度。
export const tuning=Object.freeze({
 dt:1/120, gravity:9.81,
 // 恒功率近似：低速限加速度，高速由功率与平方风阻平衡。
 maxSpeed:83, acceleration:30, power:1200, drag:1200/(83*83*83), brake:28, reverseSpeed:12, reverseAcceleration:12,
 grip:Object.freeze([1.6,1.5,.8,1,1.3,.8,0]), sandResistance:6, sandSpeed:33.33, gravelResistance:2.5,
 length:4.4,width:2,height:1.25,steerRate:7,steerReturn:9,arcadeGrip:1.5,
 jetAcceleration:21,jetCeiling:6,jetFade:2,fuelMax:1,fuelBurn:.38,fuelRecharge:.03,coinFuel:.08,coinRadius:1.6,
 // 漂移：转向角速度（弧度/秒）随按住时长从 driftRate0 增到 driftRate1（driftBuild 秒达到）、不按方向键时的比例、油门推力折扣、侧滑角（弧度）及打方向的增减、
 // 车头跟随侧滑角的速率、额外阻力、渐入时长（秒）；漂移结束后抓地恢复时长与起始折减
 driftRate0:.55,driftRate1:1.5,driftBuild:.7,driftNeutral:.45,driftThrottle:.5,driftSlipAngle:.4,driftSlipSteer:.3,driftYawFollow:6,driftDrag:2.5,driftOnset:.2,driftRecover:.25,driftRecoverGrip:.3,driftMinSpeed:15,driftExitSpeed:8,driftSlip:2,
 driftThresholds:Object.freeze([.7,1.4,2.1]),driftDurations:Object.freeze([.5,1,1.5]),
 // 连续漂移：按住反方向键持续该时长后切换；二次加速：漂移至少持续多久、窗口时长、加速时长、瞬间前冲速度
 driftSwitchDelay:.1,counterMinDrift:.35,counterWindow:.45,counterBoost:.6,counterKick:2.5,
 boostDuration:1.2,boostAcceleration:12,boostSpeed:11,rollDuration:1.15,rollMinHeight:1,rollSink:.8,
 // 侧立各停留 0.20 秒，让长车身能在高速下完整穿过八米岩缝；衔接处角速度为零。
 rollKeys:Object.freeze([0,.22,.42,.73,.93,1.15]),rollAngles:Object.freeze([0,.5,.5,1.5,1.5,2]),
 // 碰撞损失随入射法向分量变化；冷却以模拟步计。
 collisionLoss:.65,wallScrape:.8,coneRetention:.85,rockRetention:.6,rockYaw:2.5,rockCooldown:1,
 // 车间软碰撞：基础掉速比例、追尾额外掉速比例（都按接近速度占车速的比例缩放，每次接触只结算一次）、每步推出总上限（米）、
 // 同一辆车的接触冷却（秒，持续贴身期间不重复扣速）、发车与重置保护时长（秒）。
 contactLoss:.1,rearEndLoss:.15,contactPushMax:.25,contactCooldown:.3,contactGraceStart:3,contactGraceReset:2,
 // 地面跟随的竖直速度上限 = 车速 × 最大坡度 + 台阶速度；超出视为高度断层。
 maxGrade:.4,stepSpeed:1.5,
 landingThreshold:5,landingLoss:.008,stuckDuration:2,fallDepth:6,
 // 纯追踪机器人：提前扫描弯道，保守选择轮胎抓地内的车速。
 lookaheadBase:6,lookaheadSpeed:.2,botCruise:81,botCornerGrip:10,botBrakeMargin:.5,
});
export default tuning;
