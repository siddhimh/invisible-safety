import {Text} from 'troika-three-text';

//linear interpolation helps move the obj from start to target by specific alpha value t (0-1) (value stays between start and target)
function lerp(start, target, t) {
  return start + (target - start) * t
}

//clamp stops value from going outside the range (how far the animation can go) - single number
function clamp(v) {
    if (v<0) return 0;
    if (v>1) return 1;
    return v;
}

//similar to clamp but to check if point is inside or outside the circle - 2d point (control position in a plane)
function clampToRadius(x, z, radius) {
 const distance = Math.sqrt(x*x + z*z);
 if(distance ===0 || distance <= radius) return [x,z];
 const scale = radius / distance;
 return [x*scale, z*scale];
}

//to render normal HTML text inside a 3D scene
function make3DText(text, color){
    const myText= new Text();
    myText.text= text;
    myText.fontSize = 0.2
    myText.color = color
    myText.anchorX = 'center' 
    myText.anchorY = 'middle'
    myText.position.set(0, 0.5, -1)
    myText.sync()

  return myText;
} 



export { lerp, clamp, clampToRadius, make3DText };