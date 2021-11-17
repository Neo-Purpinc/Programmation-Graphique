
"use strict"

var vertexFirstPasse =
`#version 300 es
// INPUT
layout (location=0) in vec3 position_in;
layout (location=1) in vec3 normal_in;

// UNIFORM
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;

// OUTPUT
out vec4 v_pos;
out vec4 v_norm;

// MAIN PROGRAM
void main()
{	
	v_pos = uViewMatrix * vec4(position_in, 1.);
	v_norm = uViewMatrix * vec4(normal_in, 1.);
	gl_Position = vec4(position_in, 1.); 
}
`;

var fragmentFirstPasse =
`#version 300 es
// INPUT
in vec4 v_pos;
in vec4 v_norm;

// OUTPUT
layout (location=0) out vec4 position_out;
layout (location=1) out vec4 normal_out;
layout (location=2) out vec4 color_out;

// MAIN PROGRAM
void main()
{
	position_out = v_pos;
	normal_out = v_norm;
	color_out = vec4(1., 1., 1., 1.);
}
`;

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var vertexSecondPasse =
`#version 300 es

// INPUT
layout(location=0) in vec3 position_in;
layout(location=1) in vec3 normal_in;
layout(location=2) in vec3 centers_in;

// UNIFORM
// - Camera matrices
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;

// OUTPUT
out vec3 v_position;
out vec3 v_normal;

// MAIN PROGRAM
void main()
{
	vec4 view_pos = uViewMatrix * vec4(centers_in + 0.03 * position_in, 1.0);
	v_position = view_pos.xyz; // in View space
	v_normal = (uViewMatrix * vec4(centers_in + 0.03 * normal_in, 0.0)).xyz; // in View space

	gl_Position = uProjectionMatrix * view_pos;
}
`;

//--------------------------------------------------------------------------------------------------------
// FRAGMENT SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var fragmentSecondPasse =
`#version 300 es
precision highp float;

#define M_PI 3.14159265358979

// INPUT
in vec3 v_position;
in vec3 v_normal;

// UNIFORM
// Material (BRDF: bidirectional reflectance distribution function)
// uniform vec3 uKd; // diffuse
// Light (Point light)
uniform vec3 pos_lum[50];
uniform vec3 col_lum[50];
uniform int nb_lum;
uniform sampler2D uSampler1;
uniform sampler2D uSampler2;
uniform sampler2D uSampler3;

// OUTPUT
out vec4 oFragmentColor;

// MAIN PROGRAM
void main()
{
	// --------------------------------------
	// Lighting and shading: PER-FRAGMENT
	// - here, we "retrieve" mandatory information from the vertex shader (i.e. "position" and "normal")
	// --------------------------------------
	vec3 p = v_position;
	vec3 n = normalize(v_normal); // interpolated normal direction from current interpolated position in View space
	
	vec3 color = vec3(0);

	for (int i = 0; i < nb_lum; ++i)
	{
		// Reflected diffuse intensity
		vec3 lightDir = pos_lum[i] - p; // "light direction" from current interpolated position in View space
		float d2 = dot(lightDir, lightDir); // square distance from the light to the fragment
		lightDir /= sqrt(d2); // normalization of light dir -- or : lightDir = normalize(lightDir);
		float diffuseTerm = max(0.0, dot(n, lightDir)); // "max" is used to avoir "back" lighting (when light is behind the object)
		vec3 Id = (col_lum[i] / d2) * 1.0 * vec3(diffuseTerm);
		Id = Id / M_PI; // normalization of the diffuse BRDF (for energy conservation)
		
		// Reflected intensity (i.e final color)
		color += Id;
	}
	// --------------------------------------
	
	oFragmentColor = vec4(color, 1); // [values are between 0.0 and 1.0]
}
`;

//--------------------------------------------------------------------------------------------------------
// GLOBAL VARIABLES
//--------------------------------------------------------------------------------------------------------

// Shader program
var shaderProgram = null;
var fullscreen_shaderProgram = null;

// GUI (graphical user interface)
var lights_intensity;

// Renderers
var cube_rend = null;

var tex = [];
var fbo = null;
var fboTexHeight = 250;
var fboTexWidth = 250;
//
var lightsPos = [];
var lightsColor = [];
var nbLights = 10;
var nbLightsMax = 50;
var nbCubes;

//--------------------------------------------------------------------------------------------------------
// Initialize graphics objects and GL states
//
// Here, we want to load a 3D asset
// Uniforms are used to be able edit GPU data with a customized GUI (graphical user interface)
//--------------------------------------------------------------------------------------------------------
function init_wgl()
{
	// ANIMATIONS // [=> Sylvain's API]
	ewgl.continuous_update = true;
	
	UserInterface.begin(true, true);
		UserInterface.add_slider('nb lights', 1, nbLightsMax, nbLights, x=>{nbLights = x; update_wgl();}, x=> x);
		lights_intensity = UserInterface.add_slider('lights intensity', 1, 50, 10, update_wgl);
		UserInterface.add_button('move lights', update_lights_pos);
		UserInterface.add_button('change lights color', update_lights_color);
	UserInterface.end();
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	shaderProgram = ShaderProgram(vertexSecondPasse, fragmentSecondPasse, 'basic shader');
	fullscreen_shaderProgram = ShaderProgram(vertexFirstPasse, fragmentFirstPasse, 'fullscreen shader')

	// Compute a VBO to send the center of cubes (one position vec3 for each cube)
	var size = 10;	// nb cubes on a line
	nbCubes = size * size * size;	// total cubes

	// Determine the position of all cubes with their center point
	let cubes_centers = new Float32Array(nbCubes * 3);
	for (let i = 0; i < size; ++i)
	{
		for (let j = 0; j < size; ++j)
		{
			for (let k = 0; k < size; ++k)
			{
				let indice = 3 * (k + (j * size) + (i * size * size));
				let x = (2 * k) - (2 * (size / 2));
				let y = (2 * j) - (2 * (size / 2));
				let z = (2 * i) - (2 * (size / 2));
				// x
				cubes_centers[indice] = x / (size - 1);
				// y
				cubes_centers[indice + 1] = y / (size - 1);
				// z
				cubes_centers[indice + 2] = z / (size - 1);
			}
		}
	}
	// Create a VBO containing the 3D postions of the centers of the cubes
	let vbo_pos = VBO(cubes_centers, 3);

	// Create geometry : mesh cube
	let mesh = Mesh.Cube()
	// get the associated instanced renderer with positions(0) and normals(1) VBO + a vbo containing the centers of the cubes(2)
	cube_rend = mesh.instanced_renderer([[2, vbo_pos, 1]], 0, 1, -1);

	// Set the view frustrum
	ewgl.scene_camera.set_scene_radius(mesh.BB.radius);
	ewgl.scene_camera.set_scene_center(mesh.BB.center);

	// Set the lights positions and colors
	for (let i = 0; i < nbLightsMax; i++)
	{
		lightsPos.push(Vec3(getRandomMinMax(-1.0, 1.0), getRandomMinMax(-1.0, 1.0), getRandomMinMax(-1.0, 1.0)));
		lightsColor.push(Vec3(0.2 + Math.random(), 0.2 + Math.random(), 0.3 + Math.random()));
	}

	// -------------------------------------------------------------------
	// Offscreen Rendering: FBO (framebuffer object)
	// -------------------------------------------------------------------
	
	// 1) TEXTURES
	
						for(let i = 0;i<3;i++){
							tex[i] = gl.createTexture();
						
							// Bind texture as the "current" one
							// - each following GL call will affect its internal state
							gl.bindTexture(gl.TEXTURE_2D, tex[i]);
								
							// Configure data type (storage on GPU) and upload image data to GPU
							gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, fboTexWidth, fboTexHeight, 0, gl.RGBA, gl.FLOAT, null);
								
							// Configure "filtering" mode
							// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
							// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
							gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
							gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
								
							// Clean GL state
							gl.bindTexture(gl.TEXTURE_2D, null);
						}
	// 2) FBO
	
						// Generate the FBO (framebuffer object)
						fbo = gl.createFramebuffer();
						
						// - bind "fbo" as the "current" FBO (so that following command will modify its internal state)
						gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
				
						gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex[0], 0);
						gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, tex[1], 0);
						gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, tex[2], 0);
						
						// Specifies a list of color buffers to be drawn into:
						// - set the target for the fragment shader outputs
						gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2]); // could be a list, ex: [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]

						let depthRenderBuffer = gl.createRenderbuffer();
						gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer)
						gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24,fboTexWidth,fboTexHeight);
						gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depthRenderBuffer);
						
						// - reset GL state (unbind the framebuffer, and revert to default)
						gl.bindFramebuffer(gl.FRAMEBUFFER, null);
						gl.bindRenderbuffer(gl.RENDERBUFFER, null);
	// Set default GL states
	// - color to use when refreshing screen
	gl.clearColor(0, 0, 0 , 1); // black opaque [values are between 0.0 and 1.0]
	// - enable "depth test"
	gl.enable(gl.DEPTH_TEST);
}

function getRandomMinMax(min, max)
{
	return Math.random() * (max - min) + min;
}

function update_lights_pos()
{
	for (let i = 0; i < nbLightsMax; i++)
		lightsPos[i] = Vec3(getRandomMinMax(-1.0, 1.0), getRandomMinMax(-1.0, 1.0), getRandomMinMax(-1.0, 1.0));
}

function update_lights_color()
{
	for (let i = 0; i < nbLightsMax; i++)
	lightsColor[i] = Vec3(0.2 + Math.random(),0.2 + Math.random(),0.3 + Math.random());
}

//--------------------------------------------------------------------------------------------------------
// Render scene
//--------------------------------------------------------------------------------------------------------
function draw_wgl()
{
	
	
	// -------------------------------------------------------------------
	// Offscreen Rendering: FBO (framebuffer object)
	// -------------------------------------------------------------------
	
	// - bind "fbo" as the "current" FBO (so that following rendering commands will render data in its buffers [colors, depth])
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	
	// - set the viewport for the texture
	gl.viewport(0/*x*/, 0/*y*/, fboTexWidth/*width*/, fboTexHeight/*height*/);
	// Clear the GL "color" and "depth" framebuffers (with OR)
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	
	// Set "current" shader program
	fullscreen_shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	Uniforms.uViewMatrix = ewgl.scene_camera.get_view_matrix();
	cube_rend.draw(gl.TRIANGLES, nbCubes);

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	
	// - set the viewport for the main window
	gl.viewport(0/*x*/, 0/*y*/, gl.canvas.width/*width*/, gl.canvas.height/*height*/);


	// Set "current" shader program
	shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	// - camera
	// ---- retrieve current camera matrices ("view" matrix reacts to mouse events)
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	const viewMatrix = ewgl.scene_camera.get_view_matrix();
	Uniforms.uViewMatrix = viewMatrix;

	// LIGHTS
	let pl =[];
	lightsPos.forEach(l => { pl.push(viewMatrix.transform(l));});
	Uniforms.pos_lum = pl;
	let cl =[];
	lightsColor.forEach(l => { cl.push(l.normalized().scalarmult(lights_intensity.value/100));});
	Uniforms.col_lum = cl  ;
	Uniforms.nb_lum = nbLights;
	
	// Samplers
	gl.activeTexture(gl.TEXTURE0); 
	gl.bindTexture(gl.TEXTURE_2D, tex[0]);
	Uniforms.uSampler1 = 0;
	gl.activeTexture(gl.TEXTURE1); 
	gl.bindTexture(gl.TEXTURE_2D, tex[1]);
	Uniforms.uSampler2 = 1;
	gl.activeTexture(gl.TEXTURE2); 
	gl.bindTexture(gl.TEXTURE_2D, tex[2]);
	Uniforms.uSampler3 = 2;
    // render cubes
	gl.drawArrays(gl.TRIANGLES, 0, 3);

	// Reset GL state(s)
	// - unbind vertex array
	gl.bindVertexArray(null); // not mandatory. For optimization, could be removed.
	// - unbind shader program
	unbind_shader();
}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_3d();
