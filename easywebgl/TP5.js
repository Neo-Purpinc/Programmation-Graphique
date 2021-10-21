
"use strict"

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var vertexShader =
`#version 300 es

// INPUT
layout(location=1) in vec3 position_in;
layout(location=2) in vec3 normal_in;

// UNIFORM
// - Camera matrices
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
// - Model matrix
uniform mat4 uModelMatrix;
// - Normal matrix: used to transform "vectors"
uniform mat3 uNormalMatrix;

// OUPUT
// - these "per-vertex" values will be sent through the graphics pipeline to be interpolated by the hardware rasterizer and retrieved in the fragment shader
out vec3 v_position;
out vec3 v_normal;

// MAIN PROGRAM
void main()
{
	// --------------------------------------
	// Lighting and shading: PER-FRAGMENT
	// - here, we "send" mandatory information to the fragment shader (i.e. "position" and "normal")
	// --------------------------------------
	v_position = ( uViewMatrix * uModelMatrix * vec4( position_in, 1.0 ) ).xyz; // in View space
	v_normal = normalize( uNormalMatrix * normal_in ); // in View space
	
	gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4( position_in, 1.0 ); // NOTE: this could be optimized with "gl_Position = uProjectionMatrix * p;"
}
`;

//--------------------------------------------------------------------------------------------------------
// FRAGMENT SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var fragmentShader =
`#version 300 es
precision highp float;

#define M_PI 3.14159265358979

// INPUT
// Per-fragment "interpolated" directions of "normal", "light" and "viewer" directions (between each vertices of triangle primitives)
// - these previous "per-vertex" values have been sent through the graphics pipeline to be interpolated by the hardware rasterizer and retrieved in the fragment shader
in vec3 v_position;
in vec3 v_normal;

// UNIFORM
// Material (BRDF: bidirectional reflectance distribution function)
uniform vec3 uKa; // ambiant
uniform vec3 uKd; // diffuse
uniform vec3 uKs; // specular
uniform float uNs; // specular
// Light (Point light)
uniform float uLightIntensity;
uniform vec3 uLightPosition;

// OUPUT
out vec4 oFragmentColor;

// MAIN PROGRAM
void main()
{
	// --------------------------------------
	// Lighting and shading: PER-FRAGMENT
	// - here, we "retrieve" mandatory information from the vertex shader (i.e. "position" and "normal")
	// --------------------------------------
	vec3 p = v_position;
	vec3 n = normalize( v_normal ); // interpolated normal direction from current interpolated position in View space
	
	// We use the additive ADS model (ambiant, diffuse, specular) with Blinn Phong equation

	// 1) Reflected ambiant intensity
	vec3 Ia = uLightIntensity * uKa; // or just vec3 Ia = uKa;

	// 2) Reflected diffuse intensity
	// vec3 ligthPosition = vec3( 0.0, 0.0, 0.0 ); // here, we use a "hard-coded" light position located on the eye
	vec3 lightDir = uLightPosition - p; // "light direction" from current interpolated position in View space
	float d2 = dot(lightDir, lightDir);	// square distance from the light to the fragment
	lightDir /= sqrt(d2); // normalization of light dir -- or : lightDir = normalize(lightDir);
	float diffuseTerm = max( 0.0, dot( n, lightDir ) ); // "max" is used to avoir "back" lighting (when light is behind the object)
	vec3 Id = (uLightIntensity / d2) * uKd * vec3( diffuseTerm );
	Id = Id / M_PI; // normalization of the diffuse BRDF (for energy conservation)
	
	// 3) Reflected specular intensity
	vec3 Is = vec3( 0.0 );
	if ( diffuseTerm > 0.0 )
	{
		vec3 viewDir = normalize( -p.xyz ); // "view direction" from current vertex position => because, in View space, "dir = vec3( 0.0, 0.0, 0.0 ) - p"
		vec3 halfDir = normalize( viewDir + lightDir ); // half-vector between view and light vectors
		float specularTerm = max( 0.0, pow( dot( n, halfDir ), uNs ) ); // "Ns" control the size of the specular highlight (the rugosity)
		Is = uLightIntensity * uKs * vec3( specularTerm );
		Is /= (uNs + 2.0) / (2.0 * M_PI); // normalization of the specular BRDF (for energy conservation)
	}
	// Reflected intensity (i.e final color)
	vec3 color = (0.3 * Ia) + (0.3 * Id) + (0.3 * Is);
	// --------------------------------------
	
	oFragmentColor = vec4( color, 1 ); // [values are between 0.0 and 1.0]
}
`;

//--------------------------------------------------------------------------------------------------------
// GLOBAL VARIABLES
//--------------------------------------------------------------------------------------------------------

// Shader program
var shaderProgram = null;

// GUI (graphical user interface)
// - light color
// var slider_r;
// var slider_g;
// var slider_b;
// - light position
var slider_x;
var slider_y;
var slider_z;
// - light intensity
var slider_light_intensity;
// - rendering
var checkbox_wireframe;

// Scene Management
// During rendering, OpenGL requires each VAO (vertex array) and its associated number of indices (of each points of triangles) of each sub-mesh of the 3D (here: car model)
// - geometry info
var asset_vao_list = [];
var asset_nbIndices_list = [];
// - material info
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
	// Create and initialize a vertex buffer object (VBO) [it is a buffer of generic user data: positions, normals, texture coordinates, temperature, etc...]
	// - create data on CPU
	// - we store 3D normales as 1D array : (nx0,ny0,nz0, nx1,ny1,nz1, nx2,ny2,nz2, ...)
	// IMPORTANT : there are no "normals" stored in the JSON files used in this TP, so we need to compute them with the provided utility function SceneManager_calculateNormals()
	let data_normals = new Float32Array( SceneManager_calculateNormals( object.vertices, object.indices ) );
	// - create a VBO (kind of memory pointer or handle on GPU)
	let vbo_normals = gl.createBuffer();
	// - bind "current" VBO
	gl.bindBuffer( gl.ARRAY_BUFFER, vbo_normals ); // HELP: could be seen as a GPU pointer (or handle), ex: "void* vbo_normals"
	// - allocate memory on GPU (size of data) and send data from CPU to GPU
	gl.bufferData( gl.ARRAY_BUFFER, data_normals, gl.STATIC_DRAW ); // HELP: could be seen as an allocation on GPU "void* vbo_normals = new float[ data_normals.length ]"
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
	// HELP: the VAO is going to store the vbo_normals GPU pointer ("void* vbo_normals") at a given attribute ID (see next GL call)
	gl.bindBuffer( gl.ARRAY_BUFFER, vbo_normals );
	// - attach VBO to VAO
	// - tell how data is stored in "current" VBO in terms of size and format.
	// - it specifies the "location" and data format of the array of generic vertex attributes at "index" ID to use when rendering
	vertexAttributeID = 2; // specifies the "index" of the generic vertex attribute to be modified
	dataSize = 3; // 3 for 3D normals. Specifies the number of components per generic vertex attribute. Must be 1, 2, 3, 4.
	dataType = gl.FLOAT; // data type
	gl.vertexAttribPointer( vertexAttributeID, dataSize, dataType,
							false, 0, 0 ); // unused parameters for the moment (normalized, stride, pointer)
	// HELP: vertexAttribPointer() tell VAO to store the VBO handle at given attribute index "void* vbo_normals"
	// - enable the use of VBO. It enable or disable a generic vertex attribute array
	gl.enableVertexAttribArray( vertexAttributeID );
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
// Here, we want to load a 3D asset
// Uniforms are used to be able edit GPU data with a customized GUI (graphical user interface)
//--------------------------------------------------------------------------------------------------------
function init_wgl()
{
	// ANIMATIONS // [=> Sylvain's API]
	// - if animations, set this internal variable (it will refresh the window everytime)
	ewgl.continuous_update = true;
	
	// CUSTOM USER INTERFACE
	// - this will enable to use GPU "uniform" variables to be able to edit GPU constant variables (at rendering stage)
	UserInterface.begin(); // name of html id
		// LIGHT POSITION
	    // - container (H: horizontal)
		UserInterface.use_field_set( 'H', "LIGHT Position" );
			// - sliders (name, min, max, default value, callback called when value is modified)
			// - update_wgl() is callrd to refresh screen
			slider_x  = UserInterface.add_slider( 'X ', -100, 100, 0, update_wgl );
			UserInterface.set_widget_color( slider_x,'#ff0000','#ffcccc' );
			slider_y  = UserInterface.add_slider( 'Y ', -100, 100, 80, update_wgl );
			UserInterface.set_widget_color( slider_y,'#00bb00','#ccffcc');
			slider_z  = UserInterface.add_slider( 'Z ', -100, 100, 30, update_wgl );
			UserInterface.set_widget_color( slider_z, '#0000ff', '#ccccff' );
		UserInterface.end_use();
		// LIGHT Intensity
	    // - container (H: horizontal)
		UserInterface.use_field_set( 'H', "LIGHT Intensity" );
			// - sliders (name, min, max, default value, callback called when value is modified)
			// - update_wgl() is callrd to refresh screen
			slider_light_intensity  = UserInterface.add_slider( 'intensity', 0, 50, 20, update_wgl );
		UserInterface.end_use();
		// RENDERING
		// - container (H: horizontal)
		UserInterface.use_field_set( 'H', "RENDERING Mode" );
			checkbox_wireframe  = UserInterface.add_check_box( 'wireframe', false, update_wgl );
		UserInterface.end_use();
	UserInterface.end();
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	shaderProgram = ShaderProgram( vertexShader, fragmentShader, 'basic shader' );

	// Load the 3D asset (car model)
	let dataPath = 'models/nissan-gtr/part'; // BEWARE: the "models" directory HAVE TO be placed in the "tp" directory near your javascript file for the TP
	let nbMeshes = 178; // this car model is a 3D model that has been splitted into 178 pieces
	SceneManager_loadByParts( dataPath, nbMeshes );
    
    
    var texture = TextureCubeMap();
    texture.load(["textures/skybox/px.jpg,textures/skybox/nx.jpg,textures/skybox/py.jpg,textures/skybox/ny.jpg,textures/skybox/pz.jpg,textures/skybox/nz.jpg"]);
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
	
	// [part A] : set "current" shader program
	
	// Set "current" shader program
	shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]

	// [part B] : set/modify GPU "uniform" variables of current shader program
	
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
	// - camera
	// ---- retrieve current camera matrices ("view" matrix reacts to mouse events)
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	const viewMatrix = ewgl.scene_camera.get_view_matrix();
	Uniforms.uViewMatrix = viewMatrix;
	// - set model matrix
	// ---- configure YOUR custom transformations (scale, rotation, translation)
    let modelMatrix = Matrix.scale( 0.02 ); // hard-coded "scale" to be able to see the 3D asset
	Uniforms.uModelMatrix = modelMatrix;
	// - model-view matrix
	let mvm = Matrix.mult(viewMatrix, modelMatrix); // Model-view matrix
	// - normal matrix
	Uniforms.uNormalMatrix = mvm.inverse3transpose();
	// LIGHT
	// - light color
	// Uniforms.uLightIntensity = [ slider_r.value/100, slider_g.value/100, slider_b.value/100 ];
	Uniforms.uLightIntensity = slider_light_intensity.value;
	Uniforms.uLightPosition = mvm.transform(Vec3(slider_x.value, slider_y.value, slider_z.value)); // to get the position in the View space
	
	// [part C] : render your scene (3D model)
	
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
		// Set MATERIAL properties of "current" sub-mesh
		// - ambient
		Uniforms.uKa = asset_material_ka_list[ i ];
		// - diffuse
		Uniforms.uKd = asset_material_kd_list[ i ];
		// - specular
		Uniforms.uKs = asset_material_ks_list[ i ];
		Uniforms.uNs = asset_material_ns_list[ i ];
	
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
