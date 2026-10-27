// 全部手感参数集中于此；单位采用米、秒、弧度。
export const tuning=Object.freeze({
 dt:1/120, gravity:9.81,
 // 恒功率近似：低速限加速度，高速由功率与平方风阻平衡。
 maxSpeed:83, acceleration:30, power:1200, drag:1200/(83*83*83), brake:28, reverseSpeed:12, reverseAcceleration:12,
 grip:Object.freeze([1.6,1.5,.8,1,1.3,.8,0]), sandResistance:6, sandSpeed:33.33, gravelResistance:2.5,
 length:4.4,width:2,height:1.25,steerRate:3,steerReturn:4,
 jetAcceleration:21,jetCeiling:6,jetFade:2,fuelMax:1,fuelBurn:.38,fuelRecharge:.03,coinFuel:.08,coinRadius:1.6,
 // 漂移：车头角速度（弧度/秒）、打方向的增减比例、漂移中的横向抓地、侧滑角上限（横向/前进）、侧滑转回前进的比例、额外阻力
 driftYaw:1.15,driftSteerGain:.5,driftGrip:.3,driftMaxSlip:.75,driftCarry:.5,driftDrag:1.5,driftMinSpeed:15,driftExitSpeed:8,driftSlip:2,
 driftThresholds:Object.freeze([.7,1.4,2.1]),driftDurations:Object.freeze([.5,1,1.5]),
 boostDuration:1.2,boostAcceleration:12,boostSpeed:11,rollDuration:1.15,
 // 侧立各停留 0.20 秒，让长车身能在高速下完整穿过八米岩缝；衔接处角速度为零。
 rollKeys:Object.freeze([0,.22,.42,.73,.93,1.15]),rollAngles:Object.freeze([0,.5,.5,1.5,1.5,2]),
 // 碰撞损失随入射法向分量变化；冷却以模拟步计。
 collisionLoss:.65,coneRetention:.85,rockRetention:.6,rockYaw:2.5,rockCooldown:1,
 // 地面跟随的竖直速度上限 = 车速 × 最大坡度 + 台阶速度；超出视为高度断层。
 maxGrade:.4,stepSpeed:1.5,
 landingThreshold:5,landingLoss:.008,stuckDuration:2,fallDepth:6,
 // 纯追踪机器人：提前扫描弯道，保守选择轮胎抓地内的车速。
 lookaheadBase:6,lookaheadSpeed:.2,botCruise:81,botCornerGrip:10,botBrakeMargin:.5,
});
export default tuning;
