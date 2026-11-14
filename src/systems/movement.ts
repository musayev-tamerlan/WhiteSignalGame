export interface GroundPoint {
  x: number;
  z: number;
}

export interface Body extends GroundPoint {
  y: number;
  vx: number;
  vy: number;
  vz: number;
  facing: GroundPoint;
  grounded: boolean;
}

export interface MovementInput {
  right: number;
  down: number;
  run: boolean;
  jump: boolean;
}

interface Obstacle extends GroundPoint {
  width: number;
  depth: number;
}

export interface WalkArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  obstacles: readonly Obstacle[];
}

const playerRadius = 0.28;
const diagonal = Math.SQRT1_2;

export function canStandAt(x: number, z: number, area: WalkArea) {
  return x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ &&
    !area.obstacles.some(obstacle =>
      Math.abs(x - obstacle.x) < obstacle.width / 2 + playerRadius &&
      Math.abs(z - obstacle.z) < obstacle.depth / 2 + playerRadius,
    );
}

export function move(body: Body, input: MovementInput, dt: number, area: WalkArea) {
  // The camera looks down both ground axes, so convert screen directions to world directions.
  const length = Math.max(1, Math.hypot(input.right, input.down));
  const directionX = (input.right + input.down) * diagonal / length;
  const directionZ = (input.down - input.right) * diagonal / length;
  const speed = input.run ? 5.2 : 2.8;
  const acceleration = Math.min(1, dt * 14);

  body.vx += (directionX * speed - body.vx) * acceleration;
  body.vz += (directionZ * speed - body.vz) * acceleration;
  if (input.right || input.down) {
    body.facing.x = directionX;
    body.facing.z = directionZ;
  }

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const nextX = clamp(body.x + body.vx * dt, area.minX, area.maxX);
  const nextZ = clamp(body.z + body.vz * dt, area.minZ, area.maxZ);
  if (canStandAt(nextX, body.z, area)) body.x = nextX;
  else body.vx = 0;
  if (canStandAt(body.x, nextZ, area)) body.z = nextZ;
  else body.vz = 0;

  if (input.jump && body.grounded) {
    body.vy = 6.3;
    body.grounded = false;
  }
  body.vy -= 17 * dt;
  body.y += body.vy * dt;
  if (body.y <= 0) {
    body.y = 0;
    body.vy = 0;
    body.grounded = true;
  }
}
