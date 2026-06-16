import * as THREE from 'three';
import { AR_RADIUS_M, AR_SCALE } from '../projection'
import CONFIG from '../utils/sceneConfig';
import { make3DText } from '../utils/helpers';

const COL = CONFIG.COL_PALLETTE;
const DiscParams= CONFIG.DISC_PARAMS;

function buildCylindricalSurface() {
    const geometry = new THREE.CylinderGeometry(AR_RADIUS_M, AR_RADIUS_M, 0.2, 64, 1, true);
    const material = new THREE.MeshBasicMaterial({ color: COL.ground, side: THREE.DoubleSide });
    const cylindricalSurface = new THREE.Mesh(geometry, material);
    cylindricalSurface.position.y = -DiscParams.disc_height / 2;
    return cylindricalSurface;
}

function buildTop() {
    const geometry = new THREE.CircleGeometry(AR_RADIUS_M, 64);
    const material = new THREE.MeshBasicMaterial({ color: COL.ground, side: THREE.DoubleSide });
    const topSurface = new THREE.Mesh(geometry, material);
    topSurface.rotation.x = -Math.PI / 2;
    topSurface.position.y = 0.1; 
    return topSurface;
}

function buildBottom() {
    const geometry = new THREE.CircleGeometry(AR_RADIUS_M, 64);
    const material = new THREE.MeshBasicMaterial({ color: COL.ground, side: THREE.DoubleSide });
    const bottomSurface = new THREE.Mesh(geometry, material);
    bottomSurface.rotation.x = Math.PI / 2;
    bottomSurface.position.y = -DiscParams.disc_height;
    return bottomSurface;
}

function buildRim() {
    const geometry = new THREE.RingGeometry(AR_RADIUS_M * 0.95, AR_RADIUS_M, 64);
    const material = new THREE.MeshBasicMaterial({ color: COL.rim, side: THREE.DoubleSide });
    const rimSurfaceRaised = new THREE.Mesh(geometry, material);
    rimSurfaceRaised.rotation.x = -Math.PI / 2;
    rimSurfaceRaised.position.y = 0.003;
    return rimSurfaceRaised;
}

function buildDirection() {
    const group = new THREE.Group();
    group.name = 'north-indicator';

    const directionText = make3DText('N', COL.label);
    const geometry = new THREE.ConeGeometry(2, 4, 16);
    const material = new THREE.MeshBasicMaterial({ color: COL.rim });
    const directionArrow = new THREE.Mesh(geometry, material);
    directionArrow.position.set(0, 0.1, -AR_RADIUS_M * 0.62);
    directionArrow.rotation.x = -Math.PI / 2;
    group.add(directionArrow);
    group.add(directionText);
    return {group, directionArrow, directionText};
}

export function buildGroundDisc() {
    const group = new THREE.Group();
    group.name = 'ground-disc';

    const wall = buildCylindricalSurface();
    const top = buildTop();
    const bottom = buildBottom();
    const rim = buildRim();
    const direction = buildDirection();

    group.add(wall);
    group.add(top);
    group.add(bottom);
    group.add(rim);
    group.add(direction.group);

    return {group};
}


