
"use strict"

//--------------------------------------------------------------------------------------------------------
// SKY SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var sky_vert =
`#version 300 es

layout(location = 0) in vec3 position_in;
out vec3 tex_coord;
uniform mat4 projectionviewMatrix;

void main()
{
	tex_coord = position_in;
	gl_Position = projectionviewMatrix * vec4(position_in, 1.0);
}  
`;

//--------------------------------------------------------------------------------------------------------
//--------------------------------------------------------------------------------------------------------
var sky_frag =
`#version 300 es

precision highp float;
in vec3 tex_coord;
out vec4 frag;
uniform samplerCube TU;

void main()
{	
	frag = texture(TU, tex_coord);
}
`;

//--------------------------------------------------------------------------------------------------------
// LIGHTNING + REFLECTION SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var vertexShader =
`#version 300 es

layout(location = 1) in vec3 position_in;
layout(location = 2) in vec3 normal_in;

uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;
// uniform mat3 uNormalMatrix;
uniform mat3 uNormalModel;
uniform mat3 uNormalView;

// in view space
out vec3 v_position;
out vec3 v_normal;
// in world space
out vec3 w_position;
out vec3 w_normal;

void main()
{
	v_position = (uViewMatrix * uModelMatrix * vec4(position_in, 1.0)).xyz; // in View space
	v_normal = uNormalView * uNormalModel * normal_in; // in View space

	w_position = (uModelMatrix * vec4(position_in, 1.0)).xyz; // in world space
	w_normal = uNormalModel * normal_in; // in world space
	
	
	gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(position_in, 1.0);
}
`;

//--------------------------------------------------------------------------------------------------------
//--------------------------------------------------------------------------------------------------------
var fragmentShader =
`#version 300 es
precision highp float;

#define M_PI 3.14159265358979

// in view space
in vec3 v_position;
in vec3 v_normal;
// in world space
in vec3 w_position;
in vec3 w_normal;

uniform vec3 uKa; // ambiant
uniform vec3 uKd; // diffuse
uniform vec3 uKs; // specular
uniform float uNs; // specular
// Light
uniform vec3 uLightDirection; // light direction
uniform vec3 uLightIntensity; // i.e light color
// Camera
uniform vec4 uCameraPosW;


uniform samplerCube TU;
uniform float k;

uniform bool uT; // Transparency

out vec4 oFragmentColor;

vec3 lightning()
{
	vec3 p = v_position;
	vec3 n = normalize(v_normal); // interpolated normal direction from current interpolated position in View space
	
	// Ambient
	vec3 Ia = uLightIntensity * uKa;

	// Diffus (Lambert BRDF)

	// For a point light : 
	// vec3 ligthPosition = vec3(0.0, 0.0, 0.0); // here, we use a "hard-coded" light position located on the eye
	// vec3 lightDir = ligthPosition - p; // "light direction" from current interpolated position in View space
	// float d2 = dot(lightDir, lightDir);	// square distance from the light to the fragment
	// lightDir /= sqrt(d2); // normalization of light dir -- or : lightDir = normalize(lightDir);
	// float diffuseTerm = max(0.0, dot(n, lightDir)); // "max" is used to avoir "back" lighting (when light is behind the object)
	// vec3 Id = (uLightIntensity / d2) * uKd * vec3(diffuseTerm);
	
	// For a directional light
	vec3 lightDir = normalize(uLightDirection); // "light direction" : the same for every point = directional light (infinite light, like sun)
	float diffuseTerm = max(0.0, dot(n, lightDir)); // "max" is used to avoir "back" lighting (when light is behind the object)
	vec3 Id = uLightIntensity * uKd * vec3(diffuseTerm);

	Id = Id / M_PI; // normalization of the diffuse BRDF (for energy conservation)
	
	// Specular
	vec3 Is = vec3(0.0);
	if (diffuseTerm > 0.0)
	{
		vec3 viewDir = normalize(-p.xyz); // "view direction" from current vertex position => because, in View space, "dir = vec3(0.0, 0.0, 0.0) - p"
		vec3 halfDir = normalize(viewDir + lightDir); // half-vector between view and light vectors
		float specularTerm = max(0.0, pow(dot(n, halfDir), uNs)); // "Ns" control the size of the specular highlight
		Is = uLightIntensity * uKs * vec3(specularTerm);
		Is /= (uNs + 2.0) / (2.0 * M_PI); // normalization of the specular BRDF (for energy conservation)
	}

	// Reflected intensity (i.e final color)
	return (0.3 * Ia) + (0.3 * Id) + (0.3 * Is);
}

vec3 reflection()
{
	vec3 N = normalize(w_normal);						// normal
	vec3 D = normalize(w_position - vec3(uCameraPosW));	// direction from eye to frag position
	vec3 R = reflect(D, N);								// Compute the position of the reflected environment part from the direction and the normal
	return texture(TU, R).rgb;							// Get the sample in the cubemap texture at this position
}

void main()
{
	// Compute BlinnPhong lightning
	vec3 color = lightning();

	// Add reflection of the environment
	vec3 ref = reflection();

	// Mix the lightning color and the reflection color and module alpha canal to the parts of the model that are transparent
	if (uT)	// if transparency tag
	{
		color -= 0.3;	// To darken the glasses
		oFragmentColor = vec4(mix(color, ref, k), 0.8);
	}
	else oFragmentColor = vec4(mix(color, ref, k), 1);
}
`;

//--------------------------------------------------------------------------------------------------------
// GLOBAL VARIABLES
//--------------------------------------------------------------------------------------------------------

// Shader program for the car
var prg_car = null;

// For the environnement
var prg_envMap = null;
var tex_envMap = null;
var sky_rend = null;
var sl_refl = null;


// GUI (graphical user interface)
// - light color
var slider_r;
var slider_g;
var slider_b;
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
var asset_material_T_list = [];

//--------------------------------------------------------------------------
// Utility function
// - no need to understand it for the TP
//--------------------------------------------------------------------------
// Returns computed normals for provided vertices.
  // Note: Indices have to be completely defined--NO TRIANGLE_STRIP only TRIANGLES.
function SceneManager_calculateNormals(vs, ind)
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
function SceneManager_add(object)
{
	// [1] - VBO: position buffer
	let data_positions = new Float32Array(object.vertices);
	let vbo_positions = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions); // HELP: could be seen as a GPU pointer (or handle), ex: "void* vbo_positions"
	gl.bufferData(gl.ARRAY_BUFFER, data_positions, gl.STATIC_DRAW); // HELP: could be seen as an allocation on GPU "void* vbo_positions = new float[data_positions.length]"
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	
	// [2] - VBO: normal buffer
	let data_normals = new Float32Array(SceneManager_calculateNormals(object.vertices, object.indices));
	let vbo_normals = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_normals); // HELP: could be seen as a GPU pointer (or handle), ex: "void* vbo_normals"
	gl.bufferData(gl.ARRAY_BUFFER, data_normals, gl.STATIC_DRAW); // HELP: could be seen as an allocation on GPU "void* vbo_normals = new float[data_normals.length]"
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	
	// [3] - EBO: index buffer (for "indexed rendering" with glDrawElements())
	let ebo_data = new Uint32Array(object.indices);
	let ebo = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo); // HELP: could be seen as a GPU pointer (or handle), ex: "void* ebo"
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ebo_data, gl.STATIC_DRAW); // HELP: could be seen as an allocation on GPU "void* ebo = new uint[ebo_data.length]"
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
	
	// -------------------------------------------------------------------
	// Part 2: Initialize a VAO (vertex array) to hold all previous buffers "information"
	let vao = gl.createVertexArray();
	gl.bindVertexArray(vao); // IMPORTANT: all next GL commands will "affect/modify" the VAO "states" on GPU
	// [A]: position buffer
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_positions);
	let vertexAttributeID = 1; // specifies the "index" of the generic vertex attribute to be modified
	let dataSize = 3; // 3 for 3D positions. Specifies the number of components per generic vertex attribute. Must be 1, 2, 3, 4.
	let dataType = gl.FLOAT; // data type
	gl.vertexAttribPointer(vertexAttributeID, dataSize, dataType,
							false, 0, 0); // unused parameters for the moment (normalized, stride, pointer)
	gl.enableVertexAttribArray(vertexAttributeID);
	// [B]: normal buffer
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo_normals);
	vertexAttributeID = 2; // specifies the "index" of the generic vertex attribute to be modified
	dataSize = 3; // 3 for 3D normals. Specifies the number of components per generic vertex attribute. Must be 1, 2, 3, 4.
	dataType = gl.FLOAT; // data type
	gl.vertexAttribPointer(vertexAttributeID, dataSize, dataType,
							false, 0, 0); // unused parameters for the moment (normalized, stride, pointer)
	gl.enableVertexAttribArray(vertexAttributeID);
	// [C]: index buffer
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
	
	// Reset GL states
	gl.bindVertexArray(null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null); // BEWARE: only unbind the VBO after unbinding the VAO !
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); // BEWARE: only unbind the VBO after unbinding the VAO !

	// -------------------------------------------------------------------
	// Part 4: Store 3D assets info for scene management required by GL (for rendering stage)
	// -------------------------------------------------------------------
	
	// During rendering stage, OpenGL requires each VAO (vertex array)
	// and its associated number of indices (of each points of triangles) of each sub-mesh of the 3D (here: car model)
	// - push to our objects list for later access
    asset_vao_list.push(vao);
	asset_nbIndices_list.push(ebo_data.length);
	// - store material info
	asset_material_ka_list.push(object.Ka);
	asset_material_kd_list.push(object.Kd);
	asset_material_ks_list.push(object.Ks);
	asset_material_ns_list.push(object.Ns);
	asset_material_T_list.push(object.T);
}

//--------------------------------------------------------------------------
// Utility function
// - no need to understand it for the TP
//--------------------------------------------------------------------------
// Asynchronously load a file
function SceneManager_load(filename)
{
    return fetch(filename)
    .then(res => res.json())
    .then(object => SceneManager_add(object))
    .catch((err) => console.error(err, ...arguments));
}

//--------------------------------------------------------------------------
// Utility function
// - no need to understand it for the TP
//--------------------------------------------------------------------------
// Helper function for returning as list of items for a given model
function SceneManager_loadByParts(path, count)
{
    for (let i = 1; i <= count; i++)
	{
        const part = `${path}${i}.json`;
        SceneManager_load(part);
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
	ewgl.continuous_update = true;
	
	UserInterface.begin(); // name of html id
		UserInterface.use_field_set('H', "LIGHT Color");
			slider_r  = UserInterface.add_slider('R ', 0, 30, 30, update_wgl);
			UserInterface.set_widget_color(slider_r,'#ff0000','#ffcccc');
			slider_g  = UserInterface.add_slider('G ', 0, 30, 28, update_wgl);
			UserInterface.set_widget_color(slider_g,'#00bb00','#ccffcc');
			slider_b  = UserInterface.add_slider('B ', 0, 30, 25, update_wgl);
			UserInterface.set_widget_color(slider_b, '#0000ff', '#ccccff');
		UserInterface.end_use();
		UserInterface.use_field_set('H', "RENDERING Mode");
			checkbox_wireframe  = UserInterface.add_check_box('wireframe', false, update_wgl);
		UserInterface.end_use();
		sl_refl = UserInterface.add_slider("Reflection",0,100,30,update_wgl);
	UserInterface.end();
	
	
	// 1. Environnement map
	// CubeMap texture creation
	tex_envMap = TextureCubeMap();
	tex_envMap.load(["textures/skybox/px.jpg","textures/skybox/nx.jpg",
	"textures/skybox/py.jpg","textures/skybox/ny.jpg",
	"textures/skybox/nz.jpg","textures/skybox/pz.jpg"]).then(update_wgl);
	// shader prog to render the cubemap
	prg_envMap = ShaderProgram(sky_vert,sky_frag,'sky');
	// geometry for the cube map (texture cube map is map on a cube)
	sky_rend = Mesh.Cube().renderer(0, -1, -1);
	

	// 2. Object in the environnement
	prg_car = ShaderProgram(vertexShader, fragmentShader, 'basic shader');
	let dataPath = 'models/nissan-gtr/part';
	let nbMeshes = 178; // this car model is a 3D model that has been splitted into 178 pieces
	SceneManager_loadByParts(dataPath, nbMeshes);

	ewgl.scene_camera.set_scene_center(Vec3(0,0,0));

	// gl.clearColor(0, 0, 0 ,1);
	gl.enable(gl.DEPTH_TEST);
}

//--------------------------------------------------------------------------------------------------------
// Render scene
//--------------------------------------------------------------------------------------------------------
function draw_wgl()
{
	gl.clearColor(0, 0, 0, 0);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	// Render environment map
	//-----------------------------------------------------------------------------------
	// gl.disable(gl.DEPTH_TEST);
	prg_envMap.bind();
	Uniforms.projectionviewMatrix = ewgl.scene_camera.get_matrix_for_skybox();
	Uniforms.TU = tex_envMap.bind(0);
	sky_rend.draw(gl.TRIANGLES);
	// gl.enable(gl.DEPTH_TEST);

	//-----------------------------------------------------------------------------------


	// Render car
	//-----------------------------------------------------------------------------------
	prg_car.bind();
	const projectionMatrix = ewgl.scene_camera.get_projection_matrix();
	Uniforms.uProjectionMatrix = projectionMatrix;
	let viewMatrix = ewgl.scene_camera.get_view_matrix();
	Uniforms.uViewMatrix = viewMatrix;
    let modelMatrix = Matrix.scale(0.02); // hard-coded "scale" to be able to see the 3D asset
	Uniforms.uModelMatrix = modelMatrix;
	// - normal matrix
	// Uniforms.uNormalMatrix = mvm.inverse3transpose();
	Uniforms.uNormalModel = modelMatrix.inverse3transpose();
	Uniforms.uNormalView = viewMatrix.inverse3transpose();
	// - Light direction and intensity
	Uniforms.uLightDirection = viewMatrix.transform(Vec3(200.0, 200.0, -200.0));
	Uniforms.uLightIntensity = [slider_r.value, slider_g.value, slider_b.value];
	// - Camera position
	let cameraPosWorld = Matrix.mult(viewMatrix.inverse(), Vec4(0.0, 0.0, 0.0, 1.0));
	Uniforms.uCameraPosW = cameraPosWorld;

	// For reflection
	Uniforms.TU = tex_envMap.bind(0);
	Uniforms.k = 0.01 * sl_refl.value;

	// Alpha blending (for transparency)
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	
	// Draw commands
	// - rendering mode
	let drawMode = gl.TRIANGLES;
	if (checkbox_wireframe.checked)
	{
		drawMode = gl.LINE_LOOP;
	}
	// - render each sub-meshes of 3D assets
	let count = asset_vao_list.length;
	for (let i = 0; i < count; i++)
	{
		// Set MATERIAL properties of "current" sub-mesh
		// - ambient
		Uniforms.uKa = asset_material_ka_list[i];
		// - diffuse
		Uniforms.uKd = asset_material_kd_list[i];
		// - specular
		Uniforms.uKs = asset_material_ks_list[i];
		Uniforms.uNs = asset_material_ns_list[i];
		// - transparency
		Uniforms.uT = asset_material_T_list[i];
	
		gl.bindVertexArray(asset_vao_list[i]);
		
		gl.drawElements(drawMode, asset_nbIndices_list[i]/*number of vertex indices*/, gl.UNSIGNED_INT/*data type in EBO index buffer*/, 0/*not used*/);
	}
	
	gl.disable(gl.BLEND);
	//-----------------------------------------------------------------------------------
	
	// Reset GL state(s)
	gl.bindVertexArray(null); // not mandatory. For optimization, could be removed.
	gl.useProgram(null); // not mandatory. For optimization, could be removed.
}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_3d();
