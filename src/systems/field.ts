import { expedition, heaters, thinIce, type Area } from '../world/expedition-layout';
import { canStandAt, type Body, type GroundPoint } from './movement';

const patrols: Record<'ridge' | 'crevasse', GroundPoint[]> = {
  ridge: [{ x: -15, z: -1 }, { x: -9, z: 3 }, { x: 0, z: 1 }, { x: 5, z: 7 }],
  crevasse: [{ x: 4, z: 2 }, { x: 7, z: .5 }, { x: 12, z: -2 }, { x: 19, z: 2 }],
};

const distance = (a: GroundPoint, b: GroundPoint) => Math.hypot(a.x - b.x, a.z - b.z);

export class FieldConditions {
  warm = 100;
  alert = 0;
  ice = 0;
  shelter = false;
  figure?: GroundPoint;
  private checkpoint?: GroundPoint;
  private patrolIndex = 1;
  private trail?: GroundPoint;

  reset(area: Area) {
    const exposed = area === 'ridge' || area === 'crevasse';
    this.warm = 100;
    this.alert = this.ice = 0;
    this.shelter = false;
    this.trail = undefined;
    this.patrolIndex = 1;
    this.figure = exposed ? { ...patrols[area][0] } : undefined;
    this.checkpoint = exposed ? expedition[area].spawn : undefined;
  }

  tick(area: Area, body: Body, speed: number, flashlight: boolean, dt: number) {
    if ((area !== 'ridge' && area !== 'crevasse') || !this.figure) return;
    const heater = heaters[area].find(point => distance(body, point) <= 2.6);
    this.shelter = Boolean(heater);
    if (heater) this.checkpoint = heater;
    this.warm = Math.min(100, Math.max(0, this.warm + dt * (heater ? 26 : speed > 3.5 ? -.75 : -.52)));

    const thin = area === 'crevasse' && body.grounded && thinIce.some(sheet =>
      Math.abs(body.x - sheet.x) < sheet.width / 2 && Math.abs(body.z - sheet.z) < sheet.depth / 2);
    this.ice = thin ? Math.min(1, this.ice + dt / .75) : 0;
    if (this.ice >= 1) return this.recover('The ice broke. You pulled yourself back to the last heated beacon.');
    if (this.warm <= 0) return this.recover('Whiteout. You made it back to the last heated beacon.');

    const figure = this.figure;
    const range = distance(figure, body);
    const walk = expedition[area].walk;
    // Ice blocks the beam. Loud footsteps still carry around a ridge.
    const seesLight = flashlight && range < 8 && [0.25, 0.5, 0.75].every(fraction =>
      canStandAt(figure.x + (body.x - figure.x) * fraction, figure.z + (body.z - figure.z) * fraction, walk));
    const hearsSteps = range < (speed > 3.5 ? 10.5 : speed > .4 ? 3.8 : 2.3);
    const noticed = !heater && (seesLight || hearsSteps);
    this.alert = Math.min(1, Math.max(0, this.alert + dt * (noticed ? .72 : -.55)));
    if (noticed) this.trail = { x: body.x, z: body.z };
    if (heater || this.alert === 0) this.trail = undefined;
    if (!heater && this.alert > .68 && range < 1.1) {
      return this.recover('Something stepped into your tracks. You came to beneath the last heated beacon.');
    }

    const patrol = patrols[area];
    const chasing = this.trail && this.alert > .50;
    const target = chasing ? this.trail! : patrol[this.patrolIndex];
    const gap = distance(target, figure);
    if (gap < .45 && !chasing) this.patrolIndex = (this.patrolIndex + 1) % patrol.length;
    if (gap > .05) {
      const step = Math.min(gap, dt * (chasing ? 3.3 : 1.5)) / gap;
      const x = figure.x + (target.x - figure.x) * step;
      const z = figure.z + (target.z - figure.z) * step;
      // The figure can pass through ice, but the player always has a route around it.
      if (canStandAt(x, z, walk) || chasing) { figure.x = x; figure.z = z; }
      else if (!chasing) this.patrolIndex = (this.patrolIndex + 1) % patrol.length;
    }
  }

  private recover(message: string) {
    this.warm = 65;
    this.alert = this.ice = 0;
    this.trail = undefined;
    return { message, checkpoint: this.checkpoint! };
  }
}
