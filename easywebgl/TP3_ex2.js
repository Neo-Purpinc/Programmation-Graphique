
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
layout(location=1) in vec3 position_in;
layout(location=2) in vec3 normal_in;

//OUTPUT
out vec3 position;
out vec3 normal;

// UNIFORM
// - variable is prefixed by "uniform"
// - "uniforms" are variables on GPU in "constant memory" => there values are constant during a "draw command" such as drawArrays()
// - they can be seen as user custom parameters of your shaders
// - they can be accessed in any shader (vertex, fragment)
// - Camera
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
// - Model
uniform mat4 uModelMatrix;
uniform mat3 uViewModelMatrix;

// MAIN PROGRAM
void main()
{
	// MANDATORY
	// - a vertex shader MUST write the value of the predined variable " (GLSL langage)"
	// - this value represent a position in "clip-space"
	// - This is the space just before dividing coordinates "xyz" by their "w" to lie in NDC space (normalized device coordintes),
	// - i.e a cube in [-1.0;1.0]x[-1;1.0]x[-1;1.0]
	gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4( position_in, 1.0 );
	position = vec3(uViewMatrix * uModelMatrix * vec4(position_in,1.0)) ; 
	normal = uViewModelMatrix * normal_in;
}
`;

//--------------------------------------------------------------------------------------------------------
// FRAGMENT SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var fragmentShader =
`#version 300 es
precision highp float;

// INPUT
in vec3 position;
in vec3 normal;

// OUPUT
// - the default GL framebuffer is a RGBA color buffer
// - you can choose whatever name you want
// - variable is prefixed by "out"
out vec4 oFragmentColor;

// UNIFORM
// - variable is prefixed by "uniform"
// - "uniforms" are variables on GPU in "constant memory" => there values are constant during a "draw command" such as drawArrays()
// - they can be seen as user custom parameters of your shaders
// - they can be accessed in any shader (vertex, fragment)
uniform vec3 uLightIntensity;
uniform vec3 uLightPosition;
uniform vec3 uKa;
uniform vec3 uKd;
uniform vec3 uKs;
uniform float uNs;

// MAIN PROGRAM
void main()
{
	vec3 lightDirection = normalize(uLightPosition-position);
	vec3 normalizedNormal = normalize(normal);
	vec3 viewDirection = -position;
	// MANDATORY
	// - a fragment shader MUST write an RGBA color
	vec3 iA = uLightIntensity * uKa;
	vec3 iD = uLightIntensity * uKd * max(0., dot(normalizedNormal,lightDirection)/(length(normalizedNormal)*length(lightDirection)));
	vec3 iS = uLightIntensity * uKs * pow(max(0., dot(normalizedNormal,lightDirection+viewDirection)/(length(normalizedNormal)*length(lightDirection+viewDirection))),uNs);
	vec3 intensity = iA + iD + iS;
	
	oFragmentColor = vec4( intensity, 1 ); // [values are between 0.0 and 1.0]
}
`;

//--------------------------------------------------------------------------------------------------------
// GLOBAL VARIABLES
//--------------------------------------------------------------------------------------------------------

// Shader program
var shaderProgram = null;

// GUI (graphical user interface)
// - mesh color
var slider_r;
var slider_g;
var slider_b;
// - rendering
var checkbox_wireframe;

// Scene Management
// - during rendering, OpenGL requires each VAO (vertex array) and its associated number of indices (of each points of triangles) of each sub-mesh of the 3D (here: car model)
var asset_vao_list = [];
var asset_nbIndices_list = [];
var asset_material_ka_list = [];
var asset_material_kd_list = [];
var asset_material_ks_list = [];
var asset_material_ns_list = [];
//--------------------------------------------------------------------------
// Utility function
// - no need to understand it for the TP
//--------------------------------------------------------------------------
// Returns computed normals for provided vertices.
  // Note: Indices have to be completely defined--NO TRIANGLE_STRIP only TRIANGLES.
function SceneManager_calculateNormals( vs, ind )
{
    const
      x = 0,
      y = 1,
      z = 2,
      ns = [];

    // For each vertex, initialize normal x, normal y, normal z
    for (let i = 0; i < vs.length; i += 3) {
      ns[i + x] = 0.0;
      ns[i + y] = 0.0;
      ns[i + z] = 0.0;
    }

    // We work on triads of vertices to calculate
    for (let i = 0; i < ind.length; i += 3) {
      // Normals so i = i+3 (i = indices index)
      const v1 = [], v2 = [], normal = [];

      // p2 - p1
      v1[x] = vs[3 * ind[i + 2] + x] - vs[3 * ind[i + 1] + x];
      v1[y] = vs[3 * ind[i + 2] + y] - vs[3 * ind[i + 1] + y];
      v1[z] = vs[3 * ind[i + 2] + z] - vs[3 * ind[i + 1] + z];

      // p0 - p1
      v2[x] = vs[3 * ind[i] + x] - vs[3 * ind[i + 1] + x];
      v2[y] = vs[3 * ind[i] + y] - vs[3 * ind[i + 1] + y];
      v2[z] = vs[3 * ind[i] + z] - vs[3 * ind[i + 1] + z];

      // Cross product by Sarrus Rule
      normal[x] = v1[y] * v2[z] - v1[z] * v2[y];
      normal[y] = v1[z] * v2[x] - v1[x] * v2[z];
      normal[z] = v1[x] * v2[y] - v1[y] * v2[x];

      // Update the normals of that triangle: sum of vectors
      for (let j = 0; j < 3; j++) {
        ns[3 * ind[i + j] + x] = ns[3 * ind[i + j] + x] + normal[x];
        ns[3 * ind[i + j] + y] = ns[3 * ind[i + j] + y] + normal[y];
        ns[3 * ind[i + j] + z] = ns[3 * ind[i + j] + z] + normal[z];
      }
    }

    // Normalize the result.
    // The increment here is because each vertex occurs.
    for (let i = 0; i < vs.length; i += 3) {
      // With an offset of 3 in the array (due to x, y, z contiguous values)
      const nn = [];
      nn[x] = ns[i + x];
      nn[y] = ns[i + y];
      nn[z] = ns[i + z];

      let len = Math.sqrt((nn[x] * nn[x]) + (nn[y] * nn[y]) + (nn[z] * nn[z]));
      if (len === 0) len = 1.0;

      nn[x] = nn[x] / len;
      nn[y] = nn[y] / len;
      nn[z] = nn[z] / len;

      ns[i + x] = nn[x];
      ns[i + y] = nn[y];
      ns[i + z] = nn[z];
    }

    return ns;
  }

//--------------------------------------------------------------------------
// Add object to scene, by settings default and configuring all necessary buffers and textures
//
// This is the MAIN function to understand to initialize buffers on GPU required to load a 3D asset and render it with the GL library
//
// NOTE: the "object" parameter is the content of a parsed JSON file holding all sub-mesh attributes (kind of "struct" where each element is accessed by ".")
// Look at a JSON file:
// - geometry info: "vertices", "indices"
// - material info: "Ka", "Kd", "Ks" and "Ns"
//--------------------------------------------------------------------------
function SceneManager_add( object )
{
	// -------------------------------------------------------------------
	// Part 1: allocate buffers on GPU and send/fill data from CPU
	// -------------------------------------------------------------------
	
	// [1] - VBO: position buffer
	//
	// Create and initialize a vertex buffer object (VBO) [it is a buffer of generic user data: positions, normals, texture coordinates, temperature, etc...]
	// - create data on CPU
	// - we store 3D positions as 1D array : (x0,y0,z0, x1,y1,z1, x2,y2,z2, ...)
	let data_positions = new Float32Array( object.vertices );
	// - create a VBO (kind of memory pointer or handle on GPU)
	let vbo_positions = gl.createBuffer();
	// - bind "current" VBO (so that each next GL method will be associated to bound element)
	gl.bindBuffer( gl.ARRAY_BUFFER, vbo_positions ); // HELP: could be seen as a GPU pointer (or handle), ex: "void* vbo_positions"
	// - allocate memory on GPU (size of data) and send data from CPU to GPU
	gl.bufferData( gl.ARRAY_BUFFER, data_positions, gl.STATIC_DRAW ); // HELP: could be seen as an allocation on GPU "void* vbo_positions = new float[ data_positions.length ]"
	// - reset GL state
	gl.bindBuffer( gl.ARRAY_BUFFER, null );
	
	// [2] - VBO: normal buffer
	//
	// - we store 3D normales as 1D array : (nx0,ny0,nz0, nx1,ny1,nz1, nx2,ny2,nz2, ...)
	// IMPORTANT : there are no "normals" stored in the JSON files used in this TP, so we need to compute them with the provided utility function SceneManager_calculateNormals()
	let normals_array = new Float32Array(SceneManager_calculateNormals(object.vertices,object.indices));
	// - create a VBO (kind of memory pointer or handle on GPU)
	let vbo_normals = gl.createBuffer();
	// - bind "current" VBO (so that each next GL method will be associated to bound element)
	gl.bindBuffer( gl.ARRAY_BUFFER, vbo_normals);
	// - allocate memory on GPU (size of data) and send data from CPU to GPU
	gl.bufferData( gl.ARRAY_BUFFER, normals_array, gl.STATIC_DRAW ); // HELP: could be seen as an allocation on GPU "void* vbo_positions = new float[ data_positions.length ]"
	// - reset GL state
	gl.bindBuffer( gl.ARRAY_BUFFER, null );
	
	// [3] - EBO: index buffer (for "indexed rendering" with glDrawElements())
	//
	// Create and initialize an element buffer object (EBO) [it is a buffer used to store index of vertices for each primitive faces (ex: triangles)]
	// - create data on CPU
	// - we store "indices" of vertices as 1D array of "triangle" vertex indices : (i0,j0,k0, i1,j1,k1, i2,j2,k2, ...)
	let ebo_data = new Uint32Array( object.indices );
	// Index buffer
	let ebo = gl.createBuffer();
	gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, ebo ); // HELP: could be seen as a GPU pointer (or handle), ex: "void* ebo"
	// - allocate memory on GPU (size of data) and send data from CPU to GPU
	gl.bufferData( gl.ELEMENT_ARRAY_BUFFER, ebo_data, gl.STATIC_DRAW ); // HELP: could be seen as an allocation on GPU "void* ebo = new uint[ ebo_data.length ]"
	// - reset GL state
	gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, null );
	
	// -------------------------------------------------------------------
	// Part 2: Initialize a VAO (vertex array) to hold all previous buffers "information"
	//
	// a VAO is the main GL object used during rendering stage.
	// We MUST set:
	// - the list of associated/referenced buffers (VBOs, EBO)
	// - the buffer ID (index) for each VBO (a VAO can store a list of VBO ID)
	// - how to interpret each buffer in memory: which format? (float, uint...), which size? (1,2,3,4: how are grouped components [i.e vec3, vec4...]) 	
	//
	// IMPORTANT: WHY this VAO configuration step ?
	// - during rendering stage, a call to "glDrawArrays()" or "glDrawElements()" will retrieve all its data on GPU from the currently bound VAO
	// - in the "vertex shader", all declared "IN" variables are fetched from currently bound VBO at given "location ID" of the currently bound VAO
	// - that's why the VAO MUST store the handle (i.e. kind of pointer) of all its associated VBOs at dedicated index in an array if indices (called "attribute index")
	// -------------------------------------------------------------------
	
	// Initialize VAO: vertex array (the container of all VBOs and the EBO buffers)
	//
	// Create ande initialize a vertex array object (VAO) [it is a "container" of vertex buffer objects (VBO) and potential EBO]
	// - create a VAO (kind of memory pointer or handle on GPU)
	let vao = gl.createVertexArray();
	// - bind "current" VAO
	gl.bindVertexArray( vao ); // IMPORTANT: all next GL commands will "affect/modify" the VAO "states" on GPU
	//----------------------
	// [A]: position buffer
	//----------------------
	// - bind "current" VBO
	// HELP: the VAO is going to store the vbo_positions GPU pointer ("void* vbo_positions") at a given attribute ID (see next GL call)
	gl.bindBuffer( gl.ARRAY_BUFFER, vbo_positions );
	// - attach VBO to VAO
	// - tell how data is stored in "current" VBO in terms of size and format.
	// - it specifies the "location" and data format of the array of generic vertex attributes at "index" ID to use when rendering
	let vertexAttributeID = 1; // specifies the "index" of the generic vertex attribute to be modified
	let dataSize = 3; // 3 for 3D positions. Specifies the number of components per generic vertex attribute. Must be 1, 2, 3, 4.
	let dataType = gl.FLOAT; // data type
	gl.vertexAttribPointer( vertexAttributeID, dataSize, dataType,
							false, 0, 0 ); // unused parameters for the moment (normalized, stride, pointer)
	// HELP: vertexAttribPointer() tell VAO to store the VBO handle at given attribute index "void* vbo_positions"
	// - enable the use of VBO. It enable or disable a generic vertex attribute array
	gl.enableVertexAttribArray( vertexAttributeID );
	//----------------------
	// [B]: normal buffer
	//----------------------
	// - bind "current" VBO
	// HELP: the VAO is going to store the vbo_positions GPU pointer ("void* vbo_positions") at a given attribute ID (see next GL call)
	gl.bindBuffer( gl.ARRAY_BUFFER, vbo_normals );
	// - attach VBO to VAO
	// - tell how data is stored in "current" VBO in terms of size and format.
	// - it specifies the "location" and data format of the array of generic vertex attributes at "index" ID to use when rendering
	let normalsAttributeID = 2;
	let normalsDataSize = 3; // 3 for 3D positions. Specifies the number of components per generic vertex attribute. Must be 1, 2, 3, 4.;
	let normalsDataType = gl.FLOAT; // data type
	gl.vertexAttribPointer( normalsAttributeID, normalsDataSize, normalsDataType,
							false, 0, 0 );
	// HELP: vertexAttribPointer() tell VAO to store the VBO handle at given attribute index "void* vbo_positions"
	// - enable the use of VBO. It enable or disable a generic vertex attribute array
	gl.enableVertexAttribArray( normalsAttributeID ); 

	//----------------------
	// [C]: index buffer
	//----------------------
	// - bind "current" EBO
	// HELP: the VAO is going to store the ebo GPU pointer ("void* ebo")
	gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, ebo );
	
	// -------------------------------------------------------------------
	// Part 3: Reset the "modified" GL states
	// - the graphics card DRIVER hold a list of "current" elements per type (vao, vbo, ebo, etc...)
	// -------------------------------------------------------------------
	
	// Reset GL states
	gl.bindVertexArray( null );
	gl.bindBuffer( gl.ARRAY_BUFFER, null ); // BEWARE: only unbind the VBO after unbinding the VAO !
	gl.bindBuffer( gl.ELEMENT_ARRAY_BUFFER, null ); // BEWARE: only unbind the VBO after unbinding the VAO !

	// -------------------------------------------------------------------
	// Part 4: Store 3D assets info for scene management required by GL (for rendering stage)
	// -------------------------------------------------------------------
	
	// During rendering stage, OpenGL requires each VAO (vertex array)
	// and its associated number of indices (of each points of triangles) of each sub-mesh of the 3D (here: car model)
	// - push to our objects list for later access
    asset_vao_list.push( vao );
	asset_nbIndices_list.push( ebo_data.length );
	// - store material info
	asset_material_ka_list.push( object.Ka );
	asset_material_kd_list.push( object.Kd );
	asset_material_ks_list.push( object.Ks );
	asset_material_ns_list.push( object.Ns );
}

//--------------------------------------------------------------------------
// Utility function
// - no need to understand it for the TP
//--------------------------------------------------------------------------
// Asynchronously load a file
function SceneManager_load( filename )
{
    return fetch( filename )
    .then( res => res.json() )
    .then( object => SceneManager_add( object ) )
    .catch( (err) => console.error( err, ...arguments ) );
}

//--------------------------------------------------------------------------
// Utility function
// - no need to understand it for the TP
//--------------------------------------------------------------------------
// Helper function for returning as list of items for a given model
function SceneManager_loadByParts( path, count )
{
    for ( let i = 1; i <= count; i++ )
	{
        const part = `${path}${i}.json`;
        SceneManager_load( part );
    }
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
		UserInterface.use_field_set( 'H', "Mesh Color" );
			// - sliders (name, min, max, default value, callback called when value is modified)
			// - update_wgl() is callrd to refresh screen
			slider_r  = UserInterface.add_slider( 'R ', 0, 100, 0, update_wgl );
			UserInterface.set_widget_color( slider_r,'#ff0000','#ffcccc' );
			slider_g  = UserInterface.add_slider( 'G ', 0, 100, 100, update_wgl );
			UserInterface.set_widget_color( slider_g,'#00bb00','#ccffcc');
			slider_b  = UserInterface.add_slider( 'B ', 0, 100, 100, update_wgl );
			UserInterface.set_widget_color( slider_b, '#0000ff', '#ccccff' );
		UserInterface.end_use();
		// - Rendering
		// - container (H: horizontal)
		UserInterface.use_field_set( 'H', "Rendering" );
			checkbox_wireframe  = UserInterface.add_check_box( 'wireframe', false, update_wgl );
		UserInterface.end_use();
	UserInterface.end();
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	shaderProgram = ShaderProgram( vertexShader, fragmentShader, 'basic shader' );

	// Load the 3D asset (car model)
	let dataPath = 'models/nissan-gtr/part'; // BEWARE: the "models" directory HAVE TO be placed in the "tp" directory near your javascript file for the TP
	let nbMeshes = 178; // this car model is a 3D model that has been splitted into 178 pieces
	SceneManager_loadByParts( dataPath, nbMeshes );
		
	// Set default GL states
	// - color to use when refreshing screen
	gl.clearColor( 0, 0, 0 ,1 ); // black opaque [values are between 0.0 and 1.0]
	// - enable "depth test"
	// => to optimize rendering when lots of triangles
	// => you cannot control triangles ordering at rendering, but "z-buffer" prevent from rendering triangles behind previously rendered triangles
	gl.enable( gl.DEPTH_TEST );
}

//--------------------------------------------------------------------------------------------------------
// Render scene
//--------------------------------------------------------------------------------------------------------
function draw_wgl()
{
	// --------------------------------
	// [1] - always do that
	// --------------------------------
	
	// Clear the GL "color" and "depth" framebuffers (with OR)
	gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

	// --------------------------------
	// [2] - render your scene
	// --------------------------------
	
	// Set "current" shader program
	shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]

	// Set uniforms // [=> Sylvain's API - wrapper of GL code]
	//
	// NOW that the "current" shader program is bound, we can update its assoiated "uniform" variables.
	// - "uniforms" are variables on GPU in "constant memory" => their values are constant during a "draw command" such as drawArrays()
	// - they can be seen as user custom parameters of your shaders
	// - they can be accessed in any shader (vertex, fragment)
	// - when creating a "shader program", shader text files are read and analyze by GL functions
	// - a dictionnary is created with all "uniforms" declared in shader codes
	// - calling "Uniforms.xxx" is used to update value of a "uniform" on GPU
	// BEWARE: name MUST be the same as the one declared in your shaders "uniform" variable
	// - here, we retrieve "slider" values from GUI (graphical user interface)
	//Uniforms.uMeshColor = [ slider_r.value/100, slider_g.value/100, slider_b.value/100 ];
	// - camera
	// ---- retrieve current camera matrices ("view" matrix reacts to mouse events)
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	let viewMatrix = ewgl.scene_camera.get_view_matrix();
	Uniforms.uViewMatrix = viewMatrix;

	// - set model matrix
	// ---- configure YOUR custom transformations (scale, rotation, translation)
    let modelMatrix = Matrix.scale( 0.02 ); // hard-coded "scale" to be able to see the 3D asset
	Uniforms.uModelMatrix = modelMatrix;

	let view_model = Matrix.mult(viewMatrix,modelMatrix);
	Uniforms.uViewModelMatrix = view_model.inverse3transpose();
	Uniforms.uLightPosition = Vec3(0,0,0);
	Uniforms.uLightIntensity = Vec3(2,2,2);
	// Draw commands
	// - rendering mode
	let drawMode = gl.TRIANGLES;
	if ( checkbox_wireframe.checked )
	{
		drawMode = gl.LINE_LOOP;
	}
	// - render each sub-meshes of 3D assets
	let count = asset_vao_list.length;
	for ( let i = 0; i < count; i++ )
	{
		Uniforms.uKa = asset_material_ka_list[i];
		Uniforms.uKd = asset_material_kd_list[i];
		// Uniforms.uKs = asset_material_ks_list[i];
		// Uniforms.uNs = asset_material_ns_list[i];
		// Bind "current" vertex array (VAO)
		gl.bindVertexArray( asset_vao_list[ i ] );
		
		// Draw command
		// - render primitives from "current" array data (i.e. bounded VAO)
		// - during rendering stage, a call to "glDrawArrays()" or "glDrawElements()" will retrieve all its data on GPU from the currently bound VAO
		// - in the "vertex shader", all declared "IN" variables are fetched from currently bound VBO at given "location ID" of the currently bound VAO
		// - that's why the VAO MUST store the handle (i.e. kind of pointer) of all its associated VBOs at dedicated index in an array if indices (called "attribute index")
		gl.drawElements( drawMode, asset_nbIndices_list[ i ]/*number of vertex indices*/, gl.UNSIGNED_INT/*data type in EBO index buffer*/, 0/*not used*/ );
    }
	
	// -------------------------------------------------------------------
	// [3] - Reset the "modified" GL states
	//     - the graphics card DRIVER hold a list of "current" elements per type (shader program, vao, vbo, ebo, etc...)
	// -------------------------------------------------------------------
		
	// Reset GL state(s)
	// - unbind vertex array
	gl.bindVertexArray( null ); // not mandatory. For optimization, could be removed.
	// - unbind shader program
	gl.useProgram( null ); // not mandatory. For optimization, could be removed.
}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_3d();
