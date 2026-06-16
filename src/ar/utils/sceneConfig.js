const COL_PALLETTE = {
  ground: 0x23272e, // ground plane
  grid: 0x3b424c, // ground grid
  basinLine: 0x5b7689, // muted stormwater blue boundary
  basinFill: 0x33414d, // slate basin region
  water: 0x3f6b86, // muted blue accumulation
  pipe: 0x3f5d59, // desaturated teal trunk lines
  flow: 0x6f9a93, // desaturated teal flow particles
  rain: 0x6885a0, // muted blue rain
  cso: 0x7a828c, // slate node (rest)
  csoStress: 0xb5663a, // clay/orange (stress)
  overflow: 0xc2622e, // clay/orange spill
  columnLow: 0x4a5560, // slate (low risk)
  columnHigh: 0xa9663c, // muted clay (high risk)
  label: '#f2efe8', // off-white text
  wall : 0x2c3038,
  wallBottom: 0x1b1e24,
  rim: 0x3b424c, 

}




const GROUND_SIZE_M = AR_RADIUS_M * 2.2
const PIPE_Y_M = -2.5 // trunk lines sit below the ground plane
const FLOW_Y_M = PIPE_Y_M + 0.1
const WATER_BASE_Y_M = 0.15
const CSO_Y_M = 2
const CSO_RADIUS_M = 3.2
const COLUMN_SIZE_M = 26
const COLUMN_MIN_H = 1.5
const COLUMN_MAX_H = 46
const RAIN_COUNT = 600
const RAIN_TOP_Y_M = 220
const FLOW_PER_PIPE = 10

const DISC_PARAMS = {
    disc_height: 70,
    disc_thickness: 3,
    disc_segments: 64,

}

const CONFIG = { COL_PALLETTE, DISC_PARAMS };

export default CONFIG;