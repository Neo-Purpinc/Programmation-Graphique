
"use strict"

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var vertexShader =
`#version 300 es

// INPUT
layout(location=1) in vec3 position_in;
layout(location=2) in vec2 textureCoord_in;

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
	float x = -1.0 + float((gl_VertexID & 1) << 2);	// If VertexID == 1 then x = 3 else x == -1
	float y = -1.0 + float((gl_VertexID & 2) << 1); // If VertexID == 2 then y = 3 else y == -1
	
	// Compute texture coordinates between [0;1] (-1 * 0.5 + 0.5 = 0 and 1 * 0.5 + 0.5 = 1)
	// ...
	
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
	oColor = vec4(1.0, 0.0, 0.0, 1.0);
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
// TODO ...

//--------------------------------------------------------------------------------------------------------
// Initialize graphics objects and GL states
//--------------------------------------------------------------------------------------------------------
function init_wgl()
{
	// ANIMATIONS // [=> Sylvain's API]
	ewgl.continuous_update = true;
	
	// Create and initialize shader programs // [=> Sylvain's API - wrapper of GL code]
	shaderProgram = ShaderProgram(vertexShader, fragmentShader, 'basic shader');	
	// - Offscreen Rendering: FBO (framebuffer object)
	fullscreen_shaderProgram = ShaderProgram(fullscreen_vertexShader, fullscreen_fragmentShader, 'fullscreen shader');

	// Create a mesh cube and its associated renderer // [=> Sylvain's API - wrapper of GL code]
	let mesh = Mesh.Cube()
	cube_rend = mesh.renderer(1, -1, 2);

	// Set the center and the radius of the scene // [=> Sylvain's API - wrapper of GL code]
	ewgl.scene_camera.set_scene_radius(mesh.BB.radius);
	ewgl.scene_camera.set_scene_center(mesh.BB.center);	

	// -------------------------------------------------------------------
	// Offscreen Rendering: FBO (framebuffer object)
	// -------------------------------------------------------------------
	
	
	// TEXTURE
    // TODO ...
	
	// FBO
	// TODO ...


		
	// Set default GL states
	// - color to use when refreshing screen
	gl.clearColor(0, 0, 0 , 1); // black opaque [values are between 0.0 and 1.0]
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
	// TODO ...

	// - set the viewport for the texture
	// TODO ...
	
	// Clear the GL "color" framebuffer (with OR) [no depth buffer here]
	// TODO ...
	
			// --------------------------------
			// - render your scene
			// --------------------------------
	
	// Set "current" shader program
	// TODO ...
	
	// Draw commands
	// - render a full-screen quad
	// MEGA-TRICKS	: with only 1 triangle whose size is "2 times" the classical size [-1;-1]x[1;1] where GL points lie 
	//            	- The point positions are procedurally generated in the vertex shader (with gl_VertexID)
	//            	- At the "clipping" stage, after vertex shader, before rasterization, new points
    //              are generated at the corner of the "unit cube" [-1;-1;-1]x[1;1;1] in clip space,
    //              => the geometry of the triangle is clipped, and the rasterizer generate all fragments inside the viewport
    //              This is the way "shadertoy" is working
	gl.drawArrays(gl.TRIANGLES, 0, 3);
	
	// - unbind shader program
	// TODO ...
	
	// -------------------------------------------------------------------
	// Classical Rendering: default OpenGL framebuffer
	// -------------------------------------------------------------------

	// - reset GL state (unbind the framebuffer, and revert to default)
	// TODO ...
	
	// - set the viewport for the main window
	// TODO ...
	
	// Clear the GL "color" and "depth" framebuffers (with OR)
	// TODO ...

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
