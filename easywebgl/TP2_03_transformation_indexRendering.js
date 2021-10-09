
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

// UNIFORM
// - variable is prefixed by "uniform"
// - "uniforms" are variables on GPU in "constant memory" => there values are constant during a "draw command" such as drawArrays()
// - they can be seen as user custom parameters of your shaders
// - they can be accessed in any shader (vertex, fragment)
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;

uniform float uTerrainElevation;

// FUNCTIONS
// - one can define function
// - here, is it a noise function that create random values in [-1.0;1.0] given a position in [0.0;1.0]
float noise(vec2 st)
{
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// MAIN PROGRAM
void main()
{
	// "gl_PointSize" is a predined variable in GLSL to fix the size of primitives of type "GL_POINTS"
	// it wiil be used by the "rasterizer" to generate points of given size in "pixels"
	// mix(min, max, parameter) is used to "blend" linearly between "min" and "max" accordning to a parameter in [0.0;1.0]
	gl_PointSize = 10.0;
	
	// MANDATORY
	// - a vertex shader MUST write the value of the predined variable " (GLSL langage)"
	// - this value represent a position in NDC space (normalized device coordintes), i.e the cube [-1.0;1.0]x[-1;1.0]x[-1;1.0]
	vec3 position = vec3(2.0 * position_in - 1.0, 0.0);
	// add turbulence in height
	vec2 st = position_in;
	float turbulence = noise(position_in);
	position.z += turbulence / uTerrainElevation; // tune the height of turbulence
	// - write position
	gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(position, 1.0);
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
// GUI (graphical user interface)
// - mesh color
var slider_r;
var slider_g;
var slider_b;
// Terrain
var jMax = 10;
var iMax = 10;
var nbMeshIndices = 0;
var slider_terrainWidth;
var slider_terrainHeight;
var slider_terrainElevation;

//--------------------------------------------------------------------------------------------------------
// Build mesh
//--------------------------------------------------------------------------------------------------------
function buildMesh()
{
	iMax = slider_terrainWidth.value;
	jMax = slider_terrainHeight.value;

	gl.deleteVertexArray(vao);

	// Create ande initialize a vertex buffer object (VBO) [it is a buffer of generic user data: positions, normals, texture coordinates, temperature, etc...]
	// - create data on CPU
	// - this is the geometry of your object)
	// - we store 2D positions as 1D array : (x0,y0,x1,y1,x2,y2,x3,y3)
	// - for a terrain: a grid of 2D points in [0.0;1.0]
	let data_positions = new Float32Array(iMax * jMax * 2);
	for (let j = 0; j < jMax; j++)
	{
	    for (let i = 0; i < iMax; i++)
	    {
			// x
			data_positions[ 2 * (i + j * iMax) ] = i / (iMax - 1);
			// y
			data_positions[ 2 * (i + j * iMax) + 1 ] = j / (jMax - 1);
	    }
	}
	// - create a VBO (kind of memory pointer or handle on GPU)
	let vbo_positions = gl.createBuffer();
	// - bind "current" VBO
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions); 
	// - allocate memory on GPU (size of data) and send data from CPU to GPU
	gl.bufferData(gl.ARRAY_BUFFER, data_positions, gl.STATIC_DRAW);
	// - reset GL state
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	
	// Create ande initialize an element buffer object (EBO) [it is a buffer of generic user data: positions, normals, texture coordinates, temperature, etc...]
	// - create data on CPU
	// - this is the geometry of your object)
	// - we store 2D position "indices" as 1D array of "triangle" indices : (i0,j0,k0, i1,j1,k1, i2,j2,k2, ...)
	let nbMeshQuads = (iMax - 1) * (jMax - 1);
	let nbMeshTriangles = 2 * nbMeshQuads;
	nbMeshIndices = 3 * nbMeshTriangles;
	let ebo_data = new Uint32Array(nbMeshIndices);
	let current_quad = 0;
	for (let j = 0; j < jMax - 1; j++)
	{
		//for (let i = 0; i < iMax; i++)
	    for (let i = 0; i < iMax - 1; i++)
	    {
		   	// triangle 1
			ebo_data[ 6 * current_quad ] = i + j * iMax;
			ebo_data[ 6 * current_quad + 1 ] = (i + 1) + j * iMax;
			ebo_data[ 6 * current_quad + 2 ] = i + (j + 1) * iMax;
			// triangle 2
			ebo_data[ 6 * current_quad + 3 ] = i + (j + 1) * iMax;
			ebo_data[ 6 * current_quad + 4 ] = (i + 1) + j * iMax;
			ebo_data[ 6 * current_quad + 5 ] = (i + 1) + (j + 1) * iMax;
			current_quad++;
		}
	}
	let ebo = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
	// - allocate memory on GPU (size of data) and send data from CPU to GPU
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ebo_data, gl.STATIC_DRAW);
	// - reset GL state
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
	
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
	// - bind "current" EBO
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
	
	// Reset GL states
	gl.bindVertexArray(null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null); // BEWARE: only unbind the VBO after unbinding the VAO !
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); // BEWARE: only unbind the EBO after unbinding the VAO !

	// HACK...
	update_wgl();
}

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
		// MESH COLOR
	    // - container (H: horizontal)
		UserInterface.use_field_set('H', "Mesh Color");
		// - sliders (name, min, max, default value, callback called when value is modified)
		// - update_wgl() is caleld to refresh screen
		slider_r = UserInterface.add_slider('R ', 0, 100, 30, update_wgl);
		slider_g = UserInterface.add_slider('G ', 0, 100, 50, update_wgl);
		slider_b = UserInterface.add_slider('B ', 0, 100, 60, update_wgl);
		UserInterface.end_use();
		// TERRAIN
		 // - container (H: horizontal)
		UserInterface.use_field_set('H', "Terrain Generator");
		UserInterface.use_field_set('H', "Grid size");
		// - sliders (name, min, max, default value, callback called when value is modified)
		// - update_wgl() is caleld to refresh screen
		slider_terrainWidth = UserInterface.add_slider('Width', 2, 100, 10, buildMesh);
		slider_terrainHeight = UserInterface.add_slider('Height', 2, 100, 10, buildMesh);
		UserInterface.end_use();
		slider_terrainElevation = UserInterface.add_slider('Elevation', 3.0, 50.0, 5.0, update_wgl);
		UserInterface.end_use();
	UserInterface.end();
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	shaderProgram = ShaderProgram(vertexShader, fragmentShader, 'basic shader');

	// Build mesh
	buildMesh();
	
	// Set default GL states
	// - color to use when refreshing screen
	gl.clearColor(0, 0, 0 ,1); // black opaque [values are between 0.0 and 1.0]
	// - activate depth buffer
	gl.enable(gl.DEPTH_TEST);
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
	// - here, we retrieve "slider" values from GUI (graphical user interface)
	Uniforms.uMeshColor = [slider_r.value/100, slider_g.value/100, slider_b.value/100];
	Uniforms.uTerrainElevation = slider_terrainElevation.value;
	// - camera
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	Uniforms.uViewMatrix = ewgl.scene_camera.get_view_matrix();
	// - model matrix
	let maxRotationAngle = 45.0;
	Uniforms.uModelMatrix = Matrix.rotateZ(0);
	
	// Bind "current" vertex array (VAO)
	gl.bindVertexArray(vao);
	
	// Draw commands
	// - use method "drawElements(mode, count, type, indices)"
	gl.drawElements(gl.TRIANGLES, nbMeshIndices, gl.UNSIGNED_INT, 0);
	// - render primitives of type "lines"
	// ---- change "current" color
	Uniforms.uMeshColor = [1.0, 1.0, 1.0];
	gl.drawElements(gl.LINES, nbMeshIndices, gl.UNSIGNED_INT, 0);
	// - render primitives of type "point"
	// ---- change "current" color
	Uniforms.uMeshColor = [1.0, 0.0, 0.0];
	gl.drawArrays(gl.POINTS, 0, iMax * jMax);

	// Reset GL state(s)
	// - unbind vertex array
	gl.bindVertexArray(null);
	// - unbind shader program
	gl.useProgram(null);
}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_3d();
