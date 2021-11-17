
"use strict"

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var vertexShader =
`#version 300 es

// INPUT
layout(location = 1) in vec3 position_in;
layout(location = 2) in vec2 textureCoord_in;

// UNIFORM
// - Camera
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;

// OUTPUT
out vec2 v_textureCoord;

// MAIN PROGRAM
void main()
{
	// Send data to graphics pipeline
	v_textureCoord = textureCoord_in;

	gl_Position = uProjectionMatrix * uViewMatrix * vec4(position_in, 1.0);
}
`;

//--------------------------------------------------------------------------------------------------------
// FRAGMENT SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var fragmentShader =
`#version 300 es
precision highp float;

// INPUT
in vec2 v_textureCoord;

// OUTPUT
out vec4 oFragmentColor;

// UNIFORM
uniform sampler2D uSampler;

// MAIN PROGRAM
void main()
{
	vec4 textureColor = texture(uSampler, v_textureCoord);

	oFragmentColor = textureColor;
}
`;

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//
// - render a full-screen quad
// MEGA-TRICK : with only 1 triangle whose size is "2 times" the classical size [-1;-1]x[1;1] where GL points lie 
//            - The point positions are procedurally generated in the vertex shader (with gl_VertexID)
//            - At the "clipping" stage, after vertex shader, before rasterization, new points
//              are generated at the corner of the "unit cube" [-1;-1;-1]x[1;1;1] in clip space,
//              => the geometry of the triangle is clipped, and the rasterizer generate all fragments inside the viewport
//              This is the way "shadertoy" is working	
// => NO VAO, NO VBO, ONLY 1 triangle : gl.drawArrays(gl.TRIANGLES, 0, 3);
// https://rauwendaal.net/2014/06/14/rendering-a-screen-covering-triangle-in-opengl/
//--------------------------------------------------------------------------------------------------------
var fullscreen_vertexShader =
`#version 300 es

// OUTPUT
// Texture coordinates
out vec2 texCoord;

void main()
{
	// Compute vertex position between [-1;1]
	float x = -1.0 + float((gl_VertexID & 1) << 2); // If VertexID == 1 then x = 3 else x == -1
	float y = -1.0 + float((gl_VertexID & 2) << 1); // If VertexID == 2 then y = 3 else y == -1
	
	// Compute texture coordinates between [0;1] (-1 * 0.5 + 0.5 = 0 and 1 * 0.5 + 0.5 = 1)
	texCoord.x = x * 0.5 + 0.5;
	texCoord.y = y * 0.5 + 0.5;
	
	// Send position to clip space
	gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

//--------------------------------------------------------------------------------------------------------
// FRAGMENT SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var fullscreen_fragmentShader =
`#version 300 es
precision highp float;

// INPUT
// Texture coordinates
in vec2 texCoord;

// OUTPUT
out vec4 oColor;

uniform float time;

// FUNCTIONS
float noise(vec2 st)
{
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 noise2(vec2 p)
{
    return fract(sin(vec2(dot(p, vec2(12.9898, 78.233)), dot(p, vec2(26 ,18)))) * 4785.3);
}

float sdCircle(vec2 p, float r)
{
  return length(p) - r;
}

float dist(vec2 p0, vec2 p1)
{
	return sqrt((p1.x - p0.x) * (p1.x - p0.x) + (p1.y - p0.y) * (p1.y - p0.y));
}

////////////////////////////////////////////////////////////////////////////////
// PROGRAM
////////////////////////////////////////////////////////////////////////////////
void main()
{
#define MODE 4
#if MODE == 0
	oColor = vec4(texCoord, 0.0, 1.0);
#elif MODE == 1
	vec2 uv = mod(5.0 * texCoord, 1.0);
	oColor = vec4(uv, 0.0, 1.0);
#elif MODE == 2
	vec2 uv = mod(5.0 * texCoord, 1.0);
	float value = noise(uv);
	vec3 color = vec3(uv, 0);
	if (value < 0.5)
	{
		discard;
		return;
	}
	oColor = vec4(color, 1.0);
#elif MODE == 3
	vec2 uv = mod(5.0 * texCoord, 1.0);
	//vec2 uv = texCoord;
	
	// distance field
	float radius = 0.1;
	float d = sdCircle(uv - vec2(0.5), radius);
	
	vec3 color = vec3(d);
	oColor = vec4(color, 1.0);
#elif MODE == 4
	vec2 uv = texCoord;
	const int SEEDS = 50;

	float m_dist = 1.;  // minimum distance
	vec2 m_point;        // minimum position
	
	// Cell positions
	vec2 point;
	for (int i = 0; i < SEEDS; i++)
	{
		point = noise2(vec2(float(i), float(i)));
		// animate the point
		point = sin(time / 2.0 + 6.2831 * point) * 0.5 + 0.5;

		float dist = dist(uv, point);
		if (dist < m_dist)
		{
			// Keep the closer distance
			m_dist = dist;

			// Kepp the position of the closer point
			m_point = point;
		}
	}

	vec3 color = vec3(0);

	// Add distance field to closest point center
	color += m_dist * 2.;

	// tint acording the closest point position
	color.gb = m_point;

	// Show isolines
	// color -= abs(sin(50.0 * m_dist)) * 0.05;

	// Draw point center
	// color += 1. - step(.002, m_dist);

	oColor = vec4 (color, 1.0);

#else
	vec2 uv = mod(5.0 * texCoord, 1.0);

	// add turbulence
	float turbulence = noise(uv);

	float radius = 0.1;
	float d = sdCircle(uv - vec2(0.5), radius);
	
	// add perturbation
	//d += turbulence;
	
	vec3 color = vec3(d);
	oColor = vec4(color, 1.0);
#endif
}
`;

//--------------------------------------------------------------------------------------------------------
// GLOBAL VARIABLES
//--------------------------------------------------------------------------------------------------------

// Shader program
var shaderProgram = null;

// Cube Renderer
var cube_rend = null;

// FBO
var fbo = null;
var tex = null;
var fboTexWidth = 1024;
var fboTexHeight = 1024;
var fullscreen_shaderProgram = null;

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
	
	// Create and initialize shader programs // [=> Sylvain's API - wrapper of GL code]
	shaderProgram = ShaderProgram(vertexShader, fragmentShader, 'basic shader');
	// - Offscreen Rendering: FBO (framebuffer object)
	fullscreen_shaderProgram = ShaderProgram(fullscreen_vertexShader, fullscreen_fragmentShader, 'fullscreen shader');

	// Create geometry : mesh cube
	let mesh = Mesh.Cube()
	// get the associated renderer with positions(1) and textureCoords(2) VBO
	cube_rend = mesh.renderer(1, -1, 2);

	// Set the view frustrum
	ewgl.scene_camera.set_scene_radius(mesh.BB.radius);
	ewgl.scene_camera.set_scene_center(mesh.BB.center);	

	// -------------------------------------------------------------------
	// Offscreen Rendering: FBO (framebuffer object)
	// -------------------------------------------------------------------
	
	// 1) TEXTURE
	
	tex = gl.createTexture();

	// Bind texture as the "current" one
	// - each following GL call will affect its internal state
	gl.bindTexture(gl.TEXTURE_2D, tex);
		
	// Configure data type (storage on GPU) and upload image data to GPU
	// - RGBA: 4 comonents
	// - UNSIGNED_BYTE: each component is an "unsigned char" (i.e. value in [0;255]) => NOTE: on GPU data is automatically accessed with float type in [0;1] by default
    const level = 0;
	const internalFormat = gl.RGBA;
	const border = 0;
	const format = gl.RGBA;
	const type = gl.UNSIGNED_BYTE;
	const data = null;
	gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, fboTexWidth, fboTexHeight, border, format, type, data);
		
	// Configure "filtering" mode
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		
	// Clean GL state
	gl.bindTexture(gl.TEXTURE_2D, null);
	
	// 2) FBO
	
	// Generate the FBO (framebuffer object)
	fbo = gl.createFramebuffer();
	
	// - bind "fbo" as the "current" FBO (so that following command will modify its internal state)
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	
	// Bind the texture to the FBO
	//- attach a texture image to a framebuffer object
	let target = gl.FRAMEBUFFER; // Specifies the framebuffer target (binding point)
	let attachment = gl.COLOR_ATTACHMENT0; // to attach the texture to the framebuffer's color buffers [gl.COLOR_ATTACHMENTxxx, with xxx = 0 to 15]
	let textarget = gl.TEXTURE_2D; // specifying the texture target. Here, a 2D image
	let texture = tex; // Specifies the texture object whose image is to be attached
	//level = 0; // texture mipmap level. Specifying the mipmap level of the texture image to be attached
	gl.framebufferTexture2D(target, attachment, textarget, texture, level);
	
	// Specifies a list of color buffers to be drawn into:
	// - set the target for the fragment shader outputs
	// gl.NONE: Fragment shader output is not written into any color buffer.
	// gl.BACK: Fragment shader output is written into the back color buffer.
	// gl.COLOR_ATTACHMENT{0-15}: Fragment shader output is written in the nth color attachment of the current framebuffer.
	gl.drawBuffers([gl.COLOR_ATTACHMENT0]); // could be a list, ex: [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]
	
	// - reset GL state (unbind the framebuffer, and revert to default)
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		
	// Set default GL states
	// - color to use when refreshing screen
	gl.clearColor(0, 0, 0 ,1); // black opaque [values are between 0.0 and 1.0]
	// - enable "depth test"
	gl.enable(gl.DEPTH_TEST);
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
	
	// Clear the GL "color" framebuffer (with OR) [no depth buffer here]
	// - always do that
	gl.clear(gl.COLOR_BUFFER_BIT);
	
			// --------------------------------
			// - render your scene
			// --------------------------------
	
	// Set "current" shader program
	fullscreen_shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]

	Uniforms.time = ewgl.current_time;
	
	// Draw commands
	// - render a full-screen quad
	// MEGA-TRICK : with only 1 triangle whose size is "2 times" the classical size [-1;-1]x[1;1] where GL points lie 
	//            - The point positions are procedurally generated in the vertex shader (with gl_VertexID)
	//            - At the "clipping" stage, after vertex shader, before rasterization, new points
    //              are generated at the corner of the "unit cube" [-1;-1;-1]x[1;1;1] in clip space,
    //              => the geometry of the triangle is clipped, and the rasterizer generate all fragments inside the viewport
    //              This is the way "shadertoy" is working
	gl.drawArrays(gl.TRIANGLES, 0, 3);
	
	// - unbind shader program
	gl.useProgram(null); // not mandatory. For optimization, could be removed.
	
	
	// -------------------------------------------------------------------
	// Classical Rendering: default OpenGL framebuffer
	// -------------------------------------------------------------------

	// - reset GL state (unbind the framebuffer, and revert to default)
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	
	// - set the viewport for the main window
	gl.viewport(0/*x*/, 0/*y*/, gl.canvas.width/*width*/, gl.canvas.height/*height*/);
	
	// Clear the GL "color" and "depth" framebuffers (with OR)
	// - always do that
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			// --------------------------------
			// - render your scene
			// --------------------------------
	
	// [part A] : set "current" shader program
	
	// Set "current" shader program
	shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]

	// [part B] : set/modify GPU "uniform" variables of current shader program
	
	// Set uniforms // [=> Sylvain's API - wrapper of GL code]
	// - camera
	// ---- retrieve current camera matrices ("view" matrix reacts to mouse events)
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	Uniforms.uViewMatrix = ewgl.scene_camera.get_view_matrix();

	// [part C] : render your scene (3D model)
	
	// Activate texture
	// - set GL state
	// => activate current "texture unit", here 0 (for "multi-texturing", you need to assign a different "texture unit" for each texture to bind)
  	gl.activeTexture(gl.TEXTURE0); // TEXTURExxx with xxx = 0 to "harward dependent" number... [this can be queried with the OpenGL API]
	// - bind texture to previous texture unit (i.e texture unit 0)
	gl.bindTexture(gl.TEXTURE_2D, tex);
	// - set uniform
	// => same numver as the current texture unit (i.e texture unit 0)
	Uniforms.uSampler = 0;
	
	cube_rend.draw(gl.TRIANGLES);
	
	// -------------------------------------------------------------------
	// [3] - Reset the "modified" GL states
	//     - the graphics card DRIVER hold a list of "current" elements per type (shader program, vao, vbo, ebo, etc...)
	// -------------------------------------------------------------------
		
	// Reset GL state(s)
	// - unbind vertex array
	gl.bindVertexArray(null); // not mandatory. For optimization, could be removed.
	// - unbind shader program
	gl.useProgram(null); // not mandatory. For optimization, could be removed.
}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_3d();
