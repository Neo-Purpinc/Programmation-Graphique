
"use strict"

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var vertexShader =
`#version 300 es

// INPUT
// - the currently bounded vertex array (VAO) contains a VBO of 2D data (positions)
// - variable is prefixed by "in"
// - its "location index" MUST be the same value when using vertexAttribPointer() and enableVertexAttribArray() during VAO definition
layout(location = 1) in vec2 position_in;

// MAIN PROGRAM
void main()
{
	// "gl_PointSize" is a predined variable in GLSL to fix the size of primitives of type "GL_POINTS"
	// it wiil be used by the "rasterizer" to generate points of given size in "pixels"
	gl_PointSize = 8.0;
	
	// MANDATORY
	// - a vertex shader MUST write the value of the predined variable " (GLSL langage)"
	// - this value represent a position in NDC space (normalized device coordintes), i.e the cube [-1.0;1.0]x[-1;1.0]x[-1;1.0]
	gl_Position = vec4(position_in, 0.0, 1.0);
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
uniform vec3 uMeshColor;

// MAIN PROGRAM
void main()
{
	// MANDATORY
	// - a fragment shader MUST write an RGBA color
	oFragmentColor = vec4(uMeshColor, 1); // [values are between 0.0 and 1.0]
}
`;

//--------------------------------------------------------------------------------------------------------
// Global variables
//--------------------------------------------------------------------------------------------------------
var shaderProgram = null;
var vao = null;

//--------------------------------------------------------------------------------------------------------
// Initialize graphics objects and GL states
//
// Here, we want to display a square/rectangle on screen
//--------------------------------------------------------------------------------------------------------
function init_wgl()
{
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	shaderProgram = ShaderProgram(vertexShader, fragmentShader, 'basic shader');

	// Create ande initialize a vertex buffer object (VBO) [it is a buffer of generic user data: positions, normals, texture coordinates, temperature, etc...]
	// - create data on CPU
	// - this is the geometry of your object)
	// - we store 2D positions as 1D array : (x0,y0,x1,y1,x2,y2,x3,y3)
	let data_positions = new Float32Array(
	    [-0.5,-0.5, // (x0,y0)
		  0.5,-0.5, // (x1,y1)
		  0.5, 0.5, // (x2,y2)
		 -0.5, 0.5] // (x3,y3)
		);
	// - create a VBO (kind of memory pointer or handle on GPU)
	let vbo_positions = gl.createBuffer();
	// - bind "current" VBO
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions); 
	// - allocate memory on GPU (size of data) and send data from CPU to GPU
	gl.bufferData(gl.ARRAY_BUFFER, data_positions, gl.STATIC_DRAW);
	// - reset GL state
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	
	// Create ande initialize a vertex array object (VAO) [it is a "container" of vertex buffer objects (VBO)]
	// - create a VAO (kind of memory pointer or handle on GPU)
	vao = gl.createVertexArray();
	// - bind "current" VAO
	gl.bindVertexArray(vao);
	// - bind "current" VBO
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions);
	// - attach VBO to VAO
	// - tell how data is stored in "current" VBO in terms of size and format.
	// - it specifies the "location" and data format of the array of generic vertex attributes at "index" ID to use when rendering
	let vertexAttributeID = 1; // specifies the "index" of the generic vertex attribute to be modified
	let dataSize = 2; // 2 for 2D positions. Specifies the number of components per generic vertex attribute. Must be 1, 2, 3, 4.
	let dataType = gl.FLOAT; // data type
	gl.vertexAttribPointer(vertexAttributeID, dataSize, dataType,
	                        false, 0, 0); // unused parameters for the moment (normalized, stride, pointer)
	// - enable the use of VBO. It enable or disable a generic vertex attribute array
	gl.enableVertexAttribArray(vertexAttributeID);
	
	// Reset GL states
	gl.bindVertexArray(null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null); // BEWARE: only unbind the VBO after unbinding the VAO !
	
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
	
	// Set "current" shader program
	shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]

	// Set uniforms // [=> Sylvain's API - wrapper of GL code]
	// - "uniforms" are variables on GPU in "constant memory" => there values are constant during a "draw command" such as drawArrays()
	// - they can be seen as user custom parameters of your shaders
	// - they can be accessed in any shader (vertex, fragment)
	// - when creating a "shader program", shader text files are read and analyze by GL functions
	// - a dictionnary is created with all "uniforms" declared in shader codes
	// - calling "Uniforms.xxx" is used to update value of a "uniform" on GPU
	// BEWARE: name MUST be the same as the one declared in your shaders "uniform" variable
	Uniforms.uMeshColor = Vec3(0.0, 1.0, 0.0); // green color
		
	// Bind "current" vertex array (VAO)
	gl.bindVertexArray(vao);
	
	// Draw commands
	// - render 4 primitives of type "point"
	gl.drawArrays(gl.POINTS, 0, 4);
	// - render 4 primitives of type "lines"
	gl.drawArrays(gl.LINE_LOOP, 0, 4);
		
	// Reset GL state(s)
	// - unbind vertex array
	gl.bindVertexArray(null);
	// - unbind shader program
	gl.useProgram(null);
}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_2d();
