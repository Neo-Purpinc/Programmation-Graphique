"use strict";

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var vertexShader = `#version 300 es

// INPUT
// - the currently bounded vertex array (VAO) contains a VBO of 2D data (positions)
// - variable is prefixed by "in"
// - its "location index" MUST be the same value when using vertexAttribPointer() and enableVertexAttribArray() during VAO definition
layout(location = 1) in vec2 position_in;

// UNIFORM
// - variable is prefixed by "uniform"
// - "uniforms" are variables on GPU in "constant memory" => there values are constant during a "draw command" such as drawArrays()
// - they can be seen as user custom parameters of your shaders
// - they can be accessed in any shader (vertex, fragment)

uniform mat4 viewMat;
uniform mat4 projMat;
uniform float uTime;
uniform float elevation;
uniform float octave;
uniform float gain;
uniform float frequence;
uniform float lacunarite;

float random (in vec2 st) {
    return fract(sin(dot(st.xy,
                         vec2(12.9898,78.233)))*
        43758.5453123);
}//retourne un random par rapport aux coordonnées x et y 

// Based on Morgan McGuire @morgan3d
// https://www.shadertoy.com/view/4dS3Wd
//https://thebookofshaders.com/13/
float noise (in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Four corners in 2D of a tile
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}


float fbm (in vec2 st) {
    // Initial values
    float value = 0.0;
    float amplitude = elevation/10.0;
    float frequency = frequence*1.;
    //
    // Loop of octaves
    for (int i = 0; i < int(octave); i++) {
        value += amplitude * noise(frequency*st);
        st *= 2.;
       // amplitude *= gain+1.0*sin(uTime)/5.0;
       amplitude *= gain;
        frequency *= lacunarite;
    }
    return value;
}
// MAIN PROGRAM
void main()
{

  float n = fbm(vec2(position_in.x+uTime,position_in.y));
  //float n = fbm(position_in);
	// "gl_PointSize" is a predined variable in GLSL to fix the size of primitives of type "GL_POINTS"
	// it wiil be used by the "rasterizer" to generate points of given size in "pixels"
	// mix(min, max, parameter) is used to "blend" linearly between "min" and "max" accordning to a parameter in [0.0;1.0]
	gl_PointSize = 8.0;
	
	// MANDATORY
	// - a vertex shader MUST write the value of the predined variable " (GLSL langage)"
	// - this value represent a position in NDC space (normalized device coordintes), i.e the cube [-1.0;1.0]x[-1;1.0]x[-1;1.0]
gl_Position = projMat*viewMat*vec4(position_in,n, 1.0);

}
`;

//--------------------------------------------------------------------------------------------------------
// FRAGMENT SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var fragmentShader = `#version 300 es
precision highp float;

// OUTPUT
// - the default GL framebuffer is a RGBA color buffer
// - you can choose whatever name you want
// - variable is prefixed by "out"
out vec4 oFragmentColor;

// UNIFORM
// - variable is prefixed by "uniform"
// - "uniforms" are variables on GPU in "constant memory" => there values are constant during a "draw command" such as drawArrays()
// - they can be seen as user custom parameters of your shaders
// - they can be accessed in any shader (vertex, fragment)
uniform vec3 uMeshColor;

// MAIN PROGRAM
void main()
{
	// MANDATORY
	// - a fragment shader MUST write an RGBA color
	oFragmentColor = vec4(uMeshColor, 0.1); // [values are between 0.0 and 1.0]
}
`;

//--------------------------------------------------------------------------------------------------------
// Global variables
//--------------------------------------------------------------------------------------------------------
var shaderProgram = null;
var vao = null;
// GUI (graphical user interface)
// - mesh color
var slider_rouge;
var slider_g;
var slider_b;
var slider_w;
var slider_h;
var slider_e;
var slider_o;
var slider_gain;
var slider_freq;
var slider_lacun;
let animate;

//--------------------------------------------------------------------------------------------------------
// Initialize graphics objects and GL states
//
// Here, we want to display a square/rectangle on screen
// Uniforms are used to be able edit GPU data with a customized GUI (graphical user interface)
//--------------------------------------------------------------------------------------------------------

function getPosition() {
  let pos = [];
  let height = slider_h.value - 1;
  let width = slider_w.value - 1;
  for (let j = 0; j <= height; j++) {
    for (let i = 0; i <= width; i++) {
      pos[j * (width * 2 + 2) + 2 * i] = i / width - 0.5;
      pos[j * (width * 2 + 2) + 2 * i + 1] = j / height - 0.5;
    }
  }
  return pos;
}

function getIndices() {
  let element = [];
  let height = slider_h.value - 1;
  let width = slider_w.value - 1;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      element[j * (width * 6) + 6 * i + 0] = i + j * slider_w.value;
      element[j * (width * 6) + 6 * i + 1] = i + j * slider_w.value + 1;
      element[j * (width * 6) + 6 * i + 2] =
        i + j * slider_w.value + 1 * slider_w.value;

      element[j * (width * 6) + 6 * i + 3] = i + j * slider_w.value + 1;
      element[j * (width * 6) + 6 * i + 4] =
        i + j * slider_w.value + 1 * slider_w.value;
      element[j * (width * 6) + 6 * i + 5] =
        i + j * slider_w.value + 1 * slider_w.value + 1;
    }
  }
  return element;
}

function createInterface() {
  UserInterface.begin(); // name of html id
  // MESH COLOR
  // - container (H: horizontal)
  UserInterface.use_field_set("H", "Mesh Color");
  // - sliders (name, min, max, default value, callback called when value is modified)
  // - update_wgl() is caleld to refresh screen
  slider_rouge = UserInterface.add_slider("R ", 0, 100, 0, update_wgl);
  slider_g = UserInterface.add_slider("G ", 0, 100, 100, update_wgl);
  slider_b = UserInterface.add_slider("B ", 0, 100, 100, update_wgl);
  UserInterface.end_use();
  UserInterface.use_field_set("H", "Terrain Generator");
  UserInterface.use_field_set("V", "Grid Size");
  slider_w = UserInterface.add_slider("Width ", 2, 1000, 200, update_wgl);
  slider_h = UserInterface.add_slider("Height ", 2, 1000, 200, update_wgl);
  UserInterface.end_use();
  UserInterface.use_field_set("V", "Amplitude");
  slider_e = UserInterface.add_slider(
    "Elevation de base",
    0,
    10,
    5,
    update_wgl
  );
  slider_gain = UserInterface.add_slider("Gain ", 1, 100, 50, update_wgl);
  UserInterface.end_use();
  UserInterface.use_field_set("V", "Frequence ");
  slider_freq = UserInterface.add_slider(
    "Frequence de base ",
    1,
    5,
    1,
    update_wgl
  );
  slider_lacun = UserInterface.add_slider("Lacunarite ", 1, 100, 1, update_wgl);
  UserInterface.end_use();
  slider_o = UserInterface.add_slider("Octave ", 0, 15, 12, update_wgl);
  animate = UserInterface.add_check_box("Animate", false, update_wgl);

  UserInterface.end_use();

  UserInterface.end();
}

function createVAO() {
  let pos_array = new Float32Array(getPosition());
  //console.log(pos_array);
  let vbo_positions = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions);
  gl.bufferData(gl.ARRAY_BUFFER, pos_array, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions);

  let vertexAttributeID = 1;
  let dataSize = 2;
  let dataType = gl.FLOAT;
  gl.vertexAttribPointer(vertexAttributeID, dataSize, dataType, false, 0, 0);
  gl.enableVertexAttribArray(vertexAttributeID);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  let indexArray = new Uint32Array(getIndices());
  //console.log(indexArray);
  let ebo_elements = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo_elements);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo_elements);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
}

function init_wgl() {
  // ANIMATIONS // [=> Sylvain's API]
  // - if animations, set this internal variable (it will refresh the window everytime)
  ewgl.continuous_update = true;

  // CUSTOM USER INTERFACE
  // - used with "uniform" variables to be able to edit GPU constant variables
  createInterface();

  // Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
  shaderProgram = ShaderProgram(vertexShader, fragmentShader, "basic shader");
  createVAO();
  // Create ande initialize a vertex buffer object (VBO) [it is a buffer of generic user data: positions, normals, texture coordinates, temperature, etc...]
  // - create data on CPU
  // - this is the geometry of your object)
  // - we store 2D positions as 1D array : (x0,y0,x1,y1,x2,y2,x3,y3)

  gl.clearColor(0, 0, 0, 1); // black opaque [values are between 0.0 and 1.0]
  // - no depth buffer
  gl.enable(gl.DEPTH_TEST);
  //Permet la transparence
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

//--------------------------------------------------------------------------------------------------------
// Render scene
//--------------------------------------------------------------------------------------------------------

function setUniforms() {
  Uniforms.uMeshColor = Vec3(
    slider_rouge.value / 100,
    slider_g.value / 100,
    slider_b.value / 100
  );
  Uniforms.elevation = slider_e.value;
  Uniforms.gain = slider_gain.value / 100;

  Uniforms.viewMat = ewgl.scene_camera.get_view_matrix();
  Uniforms.projMat = ewgl.scene_camera.get_projection_matrix();

  Uniforms.octave = slider_o.value;

  Uniforms.frequence = slider_freq.value;
  Uniforms.lacunarite = slider_lacun.value;
  if (animate.checked == true) Uniforms.uTime = ewgl.current_time;
  else Uniforms.uTime = 0;
}

function draw_wgl() {
  gl.clear(gl.COLOR_BUFFER_BIT);
  shaderProgram.bind();
  setUniforms();

  gl.bindVertexArray(vao);
  gl.drawElements(
    gl.TRIANGLES,
    (slider_w.value - 1) * (slider_h.value - 1) * 3 * 2,
    gl.UNSIGNED_INT,
    0
  );
  gl.drawArrays(gl.POINTS, 0, slider_w.value * slider_h.value);
  gl.bindVertexArray(null);

  gl.useProgram(null);
}
//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_3d();
