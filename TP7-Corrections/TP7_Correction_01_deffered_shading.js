
"use strict"

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var deffered_visibilityPass_vertexShader =
`#version 300 es

// INPUT
layout(location = 0) in vec3 position_in;
layout(location = 1) in vec3 normal_in;
layout(location = 2) in vec3 centers_in;

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
var deffered_visibilityPass_fragmentShader =
`#version 300 es
precision highp float;

// INPUT
in vec3 v_position;
in vec3 v_normal;

// UNIFORM
// Material
uniform vec3 uKd; // diffuse


// OUPUT
// - your CUSTOM framebuffers with its attached color buffers
// - you can choose whatever name you want
// - variable is prefixed by "out"
layout(location = 0) out vec4 oFragment_position;
layout(location = 1) out vec4 oFragment_normal;
layout(location = 2) out vec4 oFragment_Kd;

// MAIN PROGRAM
void main()
{
	// MANDATORY
	// - Write data to color all buffers attached to custom FBO
	oFragment_position = vec4(v_position, 1.0);
	oFragment_normal = vec4(v_normal, 0.0);
	oFragment_Kd = vec4(uKd, 1.0);
}
`;

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var deffered_shadingPass_vertexShader =
`#version 300 es

// OUTPUT
// Texture coordinates
out vec2 texCoord;

void main()
{
	// Compute vertex position
	float x = -1.0 + float((gl_VertexID & 1) << 2);
	float y = -1.0 + float((gl_VertexID & 2) << 1);
	
	// Compute texture coordinates
	texCoord.x = x * 0.5 + 0.5;
	texCoord.y = y * 0.5 + 0.5;
	//texCoord = texCoord * 0.5 + 0.5;
	
	// Send position to clip space
	gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

//--------------------------------------------------------------------------------------------------------
// FRAGMENT SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var deffered_shadingPass_fragmentShader =
`#version 300 es
precision highp float;

#define M_PI 3.14159265358979

// INPUT
// Texture coordinates
in vec2 texCoord;

// OUTPUT
// layout (location = 0) out vec4 oColor;
out vec4 oColor;

// UNIFORM
// G-buffer from a previous visibility pass
uniform sampler2D uTexPosition;
uniform sampler2D uNormalTex;
uniform sampler2D uKdTex;
// Light (Point light)
uniform vec3 pos_lum[500];
uniform vec3 col_lum[500];
uniform int nb_lum;

////////////////////////////////////////////////////////////////////////////////
// FUNCTIONS
////////////////////////////////////////////////////////////////////////////////
vec3 diffuseModel(vec3 pos, vec3 norm, vec3 kd)
{
	vec3 p = pos;
	vec3 n = normalize(norm); // interpolated normal direction from current interpolated position in View space

	vec3 color = vec3(0);

	for (int i = 0; i < nb_lum; ++i)
	{
		// Reflected diffuse intensity
		vec3 lightDir = pos_lum[i] - p; // "light direction" from current interpolated position in View space
		float d2 = dot(lightDir, lightDir); // square distance from the light to the fragment
		lightDir /= sqrt(d2); // normalization of light dir -- or : lightDir = normalize(lightDir);
		float diffuseTerm = max(0.0, dot(n, lightDir)); // "max" is used to avoir "back" lighting (when light is behind the object)
		vec3 Id = (col_lum[i] / d2) * kd * vec3(diffuseTerm);
		Id = Id / M_PI; // normalization of the diffuse BRDF (for energy conservation)
		
		// Reflected intensity (i.e final color)
		color += Id;
	}
	
	return color;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN PROGRAM
////////////////////////////////////////////////////////////////////////////////
void main()
{
	// Retrieve current fragment info from the previous visibility pass
	vec3 position = texture(uTexPosition, texCoord).xyz;
	vec3 normal = texture(uNormalTex, texCoord).xyz;
	vec3 Kd = texture(uKdTex, texCoord).rgb;

	// Compute shading based on (Blinn-)Phong shading/mithing model
	vec3 color = diffuseModel(position, normal, Kd);

	// Write color to default GL framebuffer
	oColor = vec4(color, 1.0);
}
`;

//--------------------------------------------------------------------------------------------------------
// GLOBAL VARIABLES
//--------------------------------------------------------------------------------------------------------

// Shader program
var deffered_visibilityPass_shaderProgram = null;
var deffered_shadingPass_shaderProgram = null;

// GUI (graphical user interface)
var lights_intensity;

// Renderers
var cube_rend = null;

//
var lightsPos = [];
var lightsColor = [];
var nbLights = 10;
var nbLightsMax = 100;
var nbCubes;

// FBO - offscreen redering
var fbo = null;
var tex_position = null;
var tex_normal = null;
var tex_Kd = null;
var fboTexWidth = 1024;
var fboTexHeight = 1024;


//--------------------------------------------------------------------------------------------------------
// Initialize graphics objects and GL states
//--------------------------------------------------------------------------------------------------------
function init_wgl()
{
	// ANIMATIONS // [=> Sylvain's API]
	ewgl.continuous_update = true;

	// CUSTOM USER INTERFACE
	UserInterface.begin(true, true); // name of html id
		UserInterface.add_slider('nb lights', 1, nbLightsMax, nbLights, x=>{nbLights = x; update_wgl();}, x=> x);
		lights_intensity = UserInterface.add_slider('lights intensity', 1, 50, 10, update_wgl);
		UserInterface.add_button('move lights', update_lights_pos);
		UserInterface.add_button('change lights color', update_lights_color);
	UserInterface.end();
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	deffered_shadingPass_shaderProgram = ShaderProgram(deffered_shadingPass_vertexShader, deffered_shadingPass_fragmentShader, 'deferred shading shader');
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	// - Offscreen Rendering: FBO (framebuffer object)
	deffered_visibilityPass_shaderProgram = ShaderProgram(deffered_visibilityPass_vertexShader, deffered_visibilityPass_fragmentShader, 'deffered visibility shader');

	// Compute a VBO to send the center of cubes (one position vec3 for each cube)
	var size = 10;	// nb cubes on a line
	nbCubes = size * size * size;	// total cubes

	// Determine the position of all cubes with their center point
	let cubes_centers = new Float32Array(size * size * size * 3);
	for (let i = 0; i < size; i++)
	{
		for (let j = 0; j < size; j++)
		{
			for (let k = 0; k < size; k++)
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
	
	// POSITIONS
	tex_position = gl.createTexture();
	// Bind texture as the "current" one
	// - each following GL call will affect its internal state
	gl.bindTexture(gl.TEXTURE_2D, tex_position);
	// Configure data type (storage on GPU) and upload image data to GPU
	// - RGBA: 4 components
	// - UNSIGNED_BYTE: each component is an "unsigned char" (i.e. value in [0;255]) => NOTE: on GPU data is automatically accessed with float type in [0;1] by default
    let level = 0;
	let internalFormat = gl.RGBA32F;
	let border = 0;
	let format = gl.RGBA;
	let type = gl.FLOAT;
	let data = null;
	gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, fboTexWidth, fboTexHeight, border, format, type, data);
	// Configure "filtering" mode
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	// Clean GL state
	gl.bindTexture(gl.TEXTURE_2D, null);
	
	// NORMALS
	tex_normal = gl.createTexture();
	// Bind texture as the "current" one
	gl.bindTexture(gl.TEXTURE_2D, tex_normal);
	// Configure data type (storage on GPU) and upload image data to GPU
	// - RGBA: 4 components
	// - UNSIGNED_BYTE: each component is an "unsigned char" (i.e. value in [0;255]) => NOTE: on GPU data is automatically accessed with float type in [0;1] by default
    level = 0;
	internalFormat = gl.RGBA32F;
	border = 0;
	format = gl.RGBA;
	type = gl.FLOAT;
	data = null;
	gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, fboTexWidth, fboTexHeight, border, format, type, data);
	// Configure "filtering" mode
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	// Clean GL state
	gl.bindTexture(gl.TEXTURE_2D, null);
	
	// MATERIAL Kd (diffuse color)
	tex_Kd = gl.createTexture();
	// Bind texture as the "current" one
	gl.bindTexture(gl.TEXTURE_2D, tex_Kd);
	// Configure data type (storage on GPU) and upload image data to GPU
	// - RGBA: 4 components
	// - UNSIGNED_BYTE: each component is an "unsigned char" (i.e. value in [0;255]) => NOTE: on GPU data is automatically accessed with float type in [0;1] by default
    level = 0;
	internalFormat = gl.RGBA32F;
	border = 0;
	format = gl.RGBA;
	type = gl.FLOAT;
	data = null;
	gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, fboTexWidth, fboTexHeight, border, format, type,data);
	// Configure "filtering" mode
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	// Clean GL state
	gl.bindTexture(gl.TEXTURE_2D, null);
	
	// 2) FBO
	
	// // Generate the FBO (framebuffer object)
	fbo = gl.createFramebuffer();
	
	// // - bind "fbo" as the "current" FBO (so that following command will modify its internal state)
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	
	// Bind the texture to the FBO
	//- attach a texture image to a framebuffer object
	let target = gl.FRAMEBUFFER; // Specifies the framebuffer target (binding point)
	let textarget = gl.TEXTURE_2D; // specifying the texture target. Here, a 2D image
	//let texture = tex; // Specifies the texture object whose image is to be attached
	level = 0; // texture mipmap level. Specifying the mipmap level of the texture image to be attached
	let attachment = gl.COLOR_ATTACHMENT0; // to attach the texture to the framebuffer's color buffers [gl.COLOR_ATTACHMENTxxx, with xxx = 0 to 15]
	gl.framebufferTexture2D(target, attachment, textarget, tex_position, level);
	attachment = gl.COLOR_ATTACHMENT1; // to attach the texture to the framebuffer's color buffers [gl.COLOR_ATTACHMENTxxx, with xxx = 0 to 15]
	gl.framebufferTexture2D(target, attachment, textarget, tex_normal, level);
	attachment = gl.COLOR_ATTACHMENT2; // to attach the texture to the framebuffer's color buffers [gl.COLOR_ATTACHMENTxxx, with xxx = 0 to 15]
	gl.framebufferTexture2D(target, attachment, textarget, tex_Kd, level);
	
	// You can also add a depth buffer, but it depends of what you want
	// - we have not yet see it in TP, so just do not take care of it for the moment...
	let depthRenderBuffer = gl.createRenderbuffer();
	gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderBuffer);
	gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, fboTexWidth, fboTexHeight);
	gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRenderBuffer);
			
	// Specifies a list of color buffers to be drawn into:
	// - set the target for the fragment shader outputs
	// gl.NONE: Fragment shader output is not written into any color buffer.
	// gl.BACK: Fragment shader output is written into the back color buffer.
	// gl.COLOR_ATTACHMENT{0-15}: Fragment shader output is written in the nth color attachment of the current framebuffer.
	gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
	
	// - reset GL state (unbind the framebuffer, and revert to default)
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindRenderbuffer(gl.RENDERBUFFER, null);


		
	// Set default GL states
	// - color to use when refreshing screen
	gl.clearColor(0, 0, 0 ,1); // black opaque [values are between 0.0 and 1.0]
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
	//------------------------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------------------------
	// 1st pass : deferred visibility pass
	//------------------------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------------------------
	
	// -------------------------------------------------------------------
	// Offscreen Rendering: FBO (framebuffer object)
	// -------------------------------------------------------------------
	
	// - bind "fbo" as the "current" FBO (so that following rendering commands will render data in its buffers [colors, depth])
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		
	// - set the viewport for the texture
	gl.viewport(0/*x*/, 0/*y*/, fboTexWidth/*width*/, fboTexHeight/*height*/);
	
	// Clear the GL "color" and "depth" framebuffers (with OR)
	// - always do that
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	
	// --------------------------------
	// - render your scene
	// --------------------------------
	
	// Set "current" shader program
	deffered_visibilityPass_shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]

	// - camera
	// ---- retrieve current camera matrices ("view" matrix reacts to mouse events)
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	const viewMatrix = ewgl.scene_camera.get_view_matrix();
	Uniforms.uViewMatrix = viewMatrix;
	// Diffus material (diffuse color)
	Uniforms.uKd = Vec3(1.0, 1.0, 1.0);
	
	// render
	cube_rend.draw(gl.TRIANGLES, nbCubes);
	
	// Reset GL state(s)
	// - unbind vertex array
	gl.bindVertexArray(null); // not mandatory. For optimization, could be removed.
	// - unbind shader program
	gl.useProgram(null); // not mandatory. For optimization, could be removed.
	
	//------------------------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------------------------
	// 2nd pass : deferred shading pass
	//------------------------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------------------------
	
	// -------------------------------------------------------------------
	// Classical Rendering: default OpenGL framebuffer
	// -------------------------------------------------------------------

	// - reset GL state (unbind the framebuffer, and revert to default)
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	// gl.drawBuffers([gl.BACK]);
	
	// - set the viewport for the main window
	gl.viewport(0/*x*/, 0/*y*/, gl.canvas.width/*width*/, gl.canvas.height/*height*/);
	
	// Clear the GL "color" and "depth" framebuffers (with OR)
	// - always do that
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			// --------------------------------
			// - render your scene
			// --------------------------------
		
	// Set "current" shader program
	deffered_shadingPass_shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]
	
	// Activate textures
	// - position
  	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, tex_position);
	// - normal
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, tex_normal);
	// - Kd
	gl.activeTexture(gl.TEXTURE2);
	gl.bindTexture(gl.TEXTURE_2D, tex_Kd);
	
	// Set uniforms
	// - textures
	Uniforms.uTexPosition = 0;
	Uniforms.uNormalTex = 1;
	Uniforms.uKdTex = 2;
	
	// LIGHTS
	let pl =[];
	lightsPos.forEach(l => {pl.push(viewMatrix.transform(l));});
	Uniforms.pos_lum = pl;
	let cl =[];
	lightsColor.forEach(l => {cl.push(l.normalized().scalarmult(lights_intensity.value/100));});
	Uniforms.col_lum = cl;
	Uniforms.nb_lum = nbLights;

	// Draw commands
	// - render only one triangle for a full screen quad !
	gl.drawArrays(gl.TRIANGLES, 0, 3);	
	
	// Reset the "modified" GL states
	unbind_shader();
}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_3d();
