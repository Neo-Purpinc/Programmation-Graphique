
"use strict"

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var vertexShader =
`#version 300 es

// INPUT
// - nothing ! this is purely procedural geometry

// UNIFORM
// - variable is prefixed by "uniform"
// - "uniforms" are variables on GPU in "constant memory" => there values are constant during a "draw command" such as drawArrays()
// - they can be seen as user custom parameters of your shaders
// - they can be accessed in any shader (vertex, fragment)
uniform float uTime;
uniform int uNbVertices;
uniform int uNbInstances;

// MAIN PROGRAM
void main()
{
	// "gl_PointSize" is a predined variable in GLSL to fix the size of primitives of type "GL_POINTS"
	// it wiil be used by the "rasterizer" to generate points of given size in "pixels"
	// mix(min, max, parameter) is used to "blend" linearly between "min" and "max" accordning to a parameter in [0.0;1.0]
	gl_PointSize = mix(5.0/*min*/, 50.0/*max*/, 0.5 * sin(uTime) + 0.5);
	
	// MANDATORY
	// - a vertex shader MUST write the value of the predined variable " (GLSL langage)"
	// - this value represent a position in NDC space (normalized device coordintes), i.e the cube [-1.0;1.0]x[-1;1.0]x[-1;1.0]
	// PROCEDURAL GENERATION:
	// - gl_VertexID and gl_InstanceID are predined GLSL variables
	// - we can use them to specify data for each vertex and each instance
	// - let first create a parameter space (u,v) in [0.0;1.0]
	float u = float(gl_VertexID) / float(uNbVertices);
	float v = float(gl_InstanceID) / float(uNbInstances);
	// - now remap to [-0.5;0.5] as was the previous square when we defined geometry manually on CPU
	vec2 position = vec2(u, v) - 0.5;
	// - write position
	gl_Position = vec4(position, 0.0, 1.0);
}
`;

//--------------------------------------------------------------------------------------------------------
// FRAGMENT SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var fragmentShader =
`#version 300 es
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
uniform float uTime;

// MAIN PROGRAM
void main()
{
	// Random colors based on time [values are between 0.0 and 1.0]
	float r = 0.5 * sin(uTime) + 0.5;
	float g = 0.5 * cos(uTime * 2.0)+ 0.5;
	float b = 0.5 * sin(uTime * 0.5) + 0.5;
	vec3 meshColor = vec3(r, g , b);
	
	// MANDATORY
	// - a fragment shader MUST write an RGBA color
	oFragmentColor = vec4(meshColor, 1); // [values are between 0.0 and 1.0]
}
`;

//--------------------------------------------------------------------------------------------------------
// Global variables
//--------------------------------------------------------------------------------------------------------
var shaderProgram = null;
var vao = null;
// GUI (graphical user interface)
// - procedural generation
var slider_nbVertices;
var slider_nbInstances;

//--------------------------------------------------------------------------------------------------------
// Initialize graphics objects and GL states
//
// Here, we want to display a square/rectangle on screen
// Uniforms are used to be able edit GPU data with a customized GUI (graphical user interface)
//--------------------------------------------------------------------------------------------------------
function init_wgl()
{
	// ANIMATIONS // [=> Sylvain's API]
	// - if animations, set this internal variable (it will refresh the window everytime)
	ewgl.continuous_update = true;
	
	// CUSTOM USER INTERFACE
	// - used with "uniform" variables to be able to edit GPU constant variables
	UserInterface.begin(); // name of html id
		// PROCEDURAL GENERATION
		// - container (H: horizontal)
		UserInterface.use_field_set('H', "Procedural Generation");
		slider_nbVertices = UserInterface.add_slider('Nb Vertices', 1, 100, 10, update_wgl);
		slider_nbInstances = UserInterface.add_slider('Nb Instances', 1, 100, 10, update_wgl);
		UserInterface.end_use();
	UserInterface.end();
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	shaderProgram = ShaderProgram(vertexShader, fragmentShader, 'basic shader');
	
	texture = gl.createTexture();
    const image = new Image;
    image.src = 'textures/heightmap.png';
    image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RED,gl.RED,gl.UNSIGNED_BYTE,image);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S, gl.REPEAT);
		gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.bindTexture(gl.TEXTURE_2D,null);
    };

	// Set default GL states
	// - color to use when refreshing screen
	gl.clearColor(0, 0, 0 ,1); // black opaque [values are between 0.0 and 1.0]
	// - no depth buffer
	gl.disable(gl.DEPTH_TEST);
}

//--------------------------------------------------------------------------------------------------------
// Render scene
//--------------------------------------------------------------------------------------------------------
function draw_wgl()
{
	// --------------------------------
	// [1] - always do that
	// --------------------------------
	
	// Clear the GL color framebuffer
	gl.clear(gl.COLOR_BUFFER_BIT);

	// --------------------------------
	// [2] - render your scene
	// --------------------------------
	
	// // Set "current" shader program
	shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]

	// Set uniforms // [=> Sylvain's API - wrapper of GL code]
	// - "uniforms" are variables on GPU in "constant memory" => there values are constant during a "draw command" such as drawArrays()
	// - they can be seen as user custom parameters of your shaders
	// - they can be accessed in any shader (vertex, fragment)
	// - when creating a "shader program", shader text files are read and analyze by GL functions
	// - a dictionnary is created with all "uniforms" declared in shader codes
	// - calling "Uniforms.xxx" is used to update value of a "uniform" on GPU
	// BEWARE: name MUST be the same as the one declared in your shaders "uniform" variable
	 // - retrieve current time (float: number of seconds since start of the application) [=> Sylvain's API]
	Uniforms.uTime = ewgl.current_time;
	// - procedural generation
	// - here, we retrieve "slider" values from GUI (graphical user interface)
	Uniforms.uNbVertices = slider_nbVertices.value;
	Uniforms.uNbInstances = slider_nbInstances.value;
	
	// // Draw commands
	// - same as drawArraysInstanced(), but render a primitive made of "nb vertices", "nb instances" times
	// - here, we retrieve "slider" values from GUI (graphical user interface)
	gl.drawArraysInstanced(gl.TRIANGLES, 0/*first index of primitive*/, slider_nbVertices.value, slider_nbInstances.value);
		
	// Reset GL state(s)
	// - unbind shader program
	gl.useProgram(null);
}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_2d();
