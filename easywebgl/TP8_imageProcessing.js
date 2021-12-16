
"use strict"

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var deffered_visibilityPass_vertexShader =
`#version 300 es

// INPUT
// - the currently bounded vertex array (VAO) contains 2 VBOs of 3D data (positions and normals)
layout(location = 1) in vec3 position_in;
layout(location = 2) in vec3 normal_in;

// UNIFORM
// - Camera matrices
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
// - Model
uniform mat4 uModelMatrix;
// - Normal
uniform mat3 uNormalMatrix;

// OUTPUT
out vec3 v_position;
out vec3 v_normal;

void main()
{
	// --------------------------------------
	// Send information to frag shader for the lighting 
	// --------------------------------------
	v_position = (uViewMatrix * uModelMatrix * vec4(position_in, 1.0)).xyz; // in View space
	v_normal = normalize(uNormalMatrix * normal_in); // in View space
		
	gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(position_in, 1.0);
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
// Material (BRDF: bidirectional reflectance distribution function)
uniform vec3 uKd; // diffuse
// Light
uniform vec3 uLightIntensity; // i.e light color

// OUTPUT
out vec4 oFragmentColor;

////////////////////////////////////////////////////////////////////////////////
// FUNCTIONS
////////////////////////////////////////////////////////////////////////////////
vec3 diffuseModel(vec3 pos, vec3 norm, vec3 kd)
{
	// --------------------------------------
	// Lighting and shading
	// --------------------------------------
	// Lambert BRDF (diffus)
	// IMPORTANT: do all computation in View space, where eye is located at (0,0,0)
	vec3 p = pos; // in View space
	vec3 n = normalize(norm); // in View space
	// Reflected diffuse intensity
	vec3 ligthPosition = vec3(0.0, 0.0, 0.0); // here, we use a "hard-coded" light position located on the eye
	vec3 l = normalize(ligthPosition - p);
	float diffuseTerm = max(0.0, dot(n, l));
	vec3 Id = uLightIntensity * kd * vec3(diffuseTerm);
	
	return Id;
}

// MAIN PROGRAM
void main()
{
	// Compute "diffuse BRDF"
	vec3 color = diffuseModel(v_position, v_normal, uKd);
	
	oFragmentColor = vec4(color, 1.0);
}
`;

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var deffered_shadingPass_vertexShader =
`#version 300 es

// OUTPUT
out vec2 texCoord;

void main()
{
	// Compute vertex position
	float x = -1.0 + float((gl_VertexID & 1) << 2);
	float y = -1.0 + float((gl_VertexID & 2) << 1);
	
	// Export UV coordinates
	texCoord = vec2(0.5 * x + 0.5, 0.5 * y + 0.5);
	
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

// INPUT
in vec2 texCoord;

// OUTPUT
out vec4 oColor;

// UNIFORM
// G-buffer from a previous visibility pass
uniform sampler2D uSceneColorTex;

// Image Processing
#define FILTER_SOBEL 0
#define FILTER_MEAN 1
#define FILTER_NONE 2
uniform int uFilterType;
uniform int uScreenWidth;
uniform int uScreenHeight;
uniform float uFilterThreshold;
uniform int uFilterMaskHalfSize;

////////////////////////////////////////////////////////////////////////////////
// FUNCTIONS
////////////////////////////////////////////////////////////////////////////////

// Grayscale conversion (perceptual human vision)
float luma(vec3 color)
{
	return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

// Mean filter
vec4 filter_mean(vec2 texCoord, float du, float dv, int size)
{
	vec4 color = vec4(0.0);
		
	// Accumulate over filter mask
	for (int j = -size; j <= size; j++)
	{	
		for (int i = -size; i <= size; i++)
		{
			vec2 uv = texCoord + vec2(float(i) * du, float(j) * dv);
			color += texture(uSceneColorTex, uv);
		}
	}
	
	// Normalize filter
	int nbPixels = (2 * size + 1) * (2 * size + 1);
	color /= float(nbPixels);
	
	return color;
}

// Sobel filter
vec4 filter_sobel(vec2 texCoord, float du, float dv)
{
	vec4 color = vec4(0.0);
		
	// Retrieve neighborhood values (required for Sobel mask filter)
	// s00 s01 s02
	// s10 s11 s12
	// s20 s21 s22
	// Left
	float s00 = luma(texture(uSceneColorTex, texCoord + vec2(-du, dv)).rgb);
	float s10 = luma(texture(uSceneColorTex, texCoord + vec2(-du, 0.0)).rgb); 
	float s20 = luma(texture(uSceneColorTex, texCoord + vec2(-du, -dv)).rgb);
	// Right
	float s02 = luma(texture(uSceneColorTex, texCoord + vec2(du, dv)).rgb); 
	float s12 = luma(texture(uSceneColorTex, texCoord + vec2(du, 0.0)).rgb); 
	float s22 = luma(texture(uSceneColorTex, texCoord + vec2(du, -dv)).rgb);
	// Top
	float s01 = luma(texture(uSceneColorTex, texCoord + vec2(0.0, dv)).rgb);
	// Bottom
	float s21 = luma(texture(uSceneColorTex, texCoord + vec2(0.0, -dv)).rgb);
	
	// Horizontal Sobel filter
	// -1 0 1
	// -2 0 2
	// -1 0 1
	float sx = - s00 - 2.0 * s10 - s20 + s02 + 2.0 * s12 + s22;
	
	// Vertical Sobel filter
	// -1 -2 -1
	//  0  0  0
	//  1  2  1
	float sy = - s00 - 2.0 * s01 - s02 + s20 + 2.0 * s21 + s22;
	
	// Compute gradient norm
	float gradientNorm = sqrt(sx * sx + sy * sy);
	
	// Threshold gradient to classify between "edge" or not
	float value = step(uFilterThreshold, gradientNorm);
	
	// Write final color
	color = vec4(vec3(value), 1.0);
	
	return color;
}

////////////////////////////////////////////////////////////////////////////////
// PROGRAM
////////////////////////////////////////////////////////////////////////////////
void main()
{
	vec4 color = vec4(0.0);
	
	float du = 1.0 / float(uScreenWidth);
	float dv = 1.0 / float(uScreenHeight);
	
	// Retrieve current fragment info from the previous visibility pass
	// gl_FragCoord: contains the window-relative coordinates of the current fragment
	//vec4 color = texelFetch(uSceneColorTex, ivec2(gl_FragCoord.xy), 0/*level of detail: LOD*/).rgba;

	if (uFilterType == FILTER_MEAN)
		color = filter_mean(texCoord, du, dv, uFilterMaskHalfSize);
	else if (uFilterType == FILTER_SOBEL)
		color = filter_sobel(texCoord, du, dv);
	else // FILTER_NONE
		color = texture(uSceneColorTex, texCoord);

	// Write color to default GL framebuffer
	oColor = color;
}
`;

//--------------------------------------------------------------------------------------------------------
// GLOBAL VARIABLES
//--------------------------------------------------------------------------------------------------------

// Shader program
var deffered_visibilityPass_shaderProgram = null;
var deffered_shadingPass_shaderProgram = null;

// GUI (graphical user interface)
// - light color
var slider_r;
var slider_g;
var slider_b;
// - rendering
var checkbox_wireframe;

// Scene Management
// - geometry info
var asset_vao_list = [];
var asset_ebo_list = [];
var asset_nbIndices_list = [];
// - material info
var asset_material_kd_list = [];

// FBO - offscreen redering
var fbo = null;
var tex_sceneColor = null;
var fboTexWidth = 1024;
var fboTexHeight = 1024;

// - GUI
var slider_filterType;
var slider_filterThreshold;
var slider_filterMaskHalfSize;

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
//--------------------------------------------------------------------------
function SceneManager_add(object)
{
	// -------------------------------------------------------------------
	// Part 1: allocate buffers on GPU and send/fill data from CPU
	// -------------------------------------------------------------------
	
	// [1] - VBO: position buffer
	let data_positions = new Float32Array(object.vertices);
	let vbo_positions = VBO(data_positions, 3);
	
	// [2] - VBO: normal buffer
	let data_normals = new Float32Array(SceneManager_calculateNormals(object.vertices, object.indices));
	let vbo_normals = VBO(data_normals, 3);
	
	// [3] - EBO: index buffer (for "indexed rendering" with glDrawElements())
	let ebo_data = new Uint32Array(object.indices);
	let ebo = EBO(ebo_data);
	
	// -------------------------------------------------------------------
	// Part 2: Initialize a VAO (vertex array) to hold all previous buffers "information"
	let vao = VAO([1, vbo_positions], [2, vbo_normals]);

	// -------------------------------------------------------------------
	// Part 3: Reset the "modified" GL states
	unbind_vao();
	unbind_ebo();
	unbind_vbo();

	// -------------------------------------------------------------------
	// Part 4: Store 3D assets info for scene management required by GL (for rendering stage)
	// -------------------------------------------------------------------
	
	// During rendering stage, OpenGL requires each VAO (vertex array)
	// and its associated number of indices (of each points of triangles) of each sub-mesh of the 3D (here: car model)
	// - push to our objects list for later access
    asset_vao_list.push(vao);
    asset_ebo_list.push(ebo);
	asset_nbIndices_list.push(ebo_data.length);
	// - store material info
	asset_material_kd_list.push(object.Kd);
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
	// ANIMATIONS // [=> Sylvain's API]
	// - if animations, set this internal variable (it will refresh the window everytime)
	ewgl.continuous_update = true;
	
	// CUSTOM USER INTERFACE
	// - this will enable to use GPU "uniform" variables to be able to edit GPU constant variables (at rendering stage)
	UserInterface.begin(); // name of html id
		// LIGHT COLOR
		UserInterface.use_field_set('H', "LIGHT Color");
			// - sliders (name, min, max, default value, callback called when value is modified)
			// - update_wgl() is callrd to refresh screen
			slider_r  = UserInterface.add_slider('R ', 0, 100, 100, update_wgl);
			UserInterface.set_widget_color(slider_r,'#ff0000','#ffcccc');
			slider_g  = UserInterface.add_slider('G ', 0, 100, 100, update_wgl);
			UserInterface.set_widget_color(slider_g,'#00bb00','#ccffcc');
			slider_b  = UserInterface.add_slider('B ', 0, 100, 100, update_wgl);
			UserInterface.set_widget_color(slider_b, '#0000ff', '#ccccff');
		UserInterface.end_use();
		// RENDERING
		UserInterface.use_field_set('H', "RENDERING Mode");
			checkbox_wireframe  = UserInterface.add_check_box('wireframe', false, update_wgl);
		UserInterface.end_use();
		// IMAGE PROCESSING
		UserInterface.use_field_set('V', "Image Processing");
			slider_filterType  = UserInterface.add_radio('H', 'Filter Type', ['sobel', 'mean', 'none'], 0, update_wgl);
			slider_filterThreshold  = UserInterface.add_slider('Threshold (sobel)', 1, 99, 20, update_wgl);
			slider_filterMaskHalfSize  = UserInterface.add_slider('Mask Half-Size (mean)', 1, 15, 5, update_wgl);
		UserInterface.end_use();
	UserInterface.end();
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	deffered_shadingPass_shaderProgram = ShaderProgram(deffered_shadingPass_vertexShader, deffered_shadingPass_fragmentShader, 'deferred shading shader');
	// - Offscreen Rendering: FBO (framebuffer object)
	deffered_visibilityPass_shaderProgram = ShaderProgram(deffered_visibilityPass_vertexShader, deffered_visibilityPass_fragmentShader, 'deffered visibility shader');

	// Load the 3D asset (car model)
	let dataPath = 'models/nissan-gtr/part'; // BEWARE: the "models" directory HAVE TO be placed in the "tp" directory near your javascript file for the TP
	let nbMeshes = 178; // this car model is a 3D model that has been splitted into 178 pieces
	SceneManager_loadByParts(dataPath, nbMeshes);

	// -------------------------------------------------------------------
	// Offscreen Rendering: FBO (framebuffer object)
	// -------------------------------------------------------------------
	// 1) TEXTURE
	tex_sceneColor = Texture2d();
	tex_sceneColor.init(gl.RGBA8);
	// 2) FBO
	fbo = FBO_Depth(tex_sceneColor);
	fbo.resize(fboTexWidth, fboTexHeight);

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
	//------------------------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------------------------
	// 1st pass : deferred visibility pass
	//------------------------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------------------------
	
	// -------------------------------------------------------------------
	// Offscreen Rendering: FBO (framebuffer object)
	// -------------------------------------------------------------------
	
	push_fbo();
	fbo.bind();
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	
			// --------------------------------
			// - render your scene
			// --------------------------------
	
	// Set "current" shader program
	deffered_visibilityPass_shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]
	
	// Set uniforms // [=> Sylvain's API - wrapper of GL code]
	// - camera
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	Uniforms.uViewMatrix = ewgl.scene_camera.get_view_matrix();
	// - set model matrix
    let modelMatrix = Matrix.scale(0.02); // hard-coded "scale" to be able to see the 3D asset
	Uniforms.uModelMatrix = modelMatrix;
	// - normal matrix
	Uniforms.uNormalMatrix = (Matrix.mult(ewgl.scene_camera.get_view_matrix(), modelMatrix)).inverse3transpose();	
	// LIGHT
	// - light color
	Uniforms.uLightIntensity = [slider_r.value/100, slider_g.value/100, slider_b.value/100];
	
	// render your scene (3D model)
	
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
		// - diffuse
		Uniforms.uKd = asset_material_kd_list[i];
	
		// Bind "current" vertex array (VAO) and indices array (EBO)
		asset_vao_list[i].bind();
		asset_ebo_list[i].bind();
		
		// Draw command
		// - render primitives from "current" array data (i.e. bounded VAO)
		// - during rendering stage, a call to "glDrawArrays()" or "glDrawElements()" will retrieve all its data on GPU from the currently bound VAO
		// - in the "vertex shader", all declared "IN" variables are fetched from currently bound VBO at given "location ID" of the currently bound VAO
		// - that's why the VAO MUST store the handle (i.e. kind of pointer) of all its associated VBOs at dedicated index in an array if indices (called "attribute index")
		gl.drawElements(drawMode, asset_nbIndices_list[i]/*number of vertex indices*/, gl.UNSIGNED_INT/*data type in EBO index buffer*/, 0/*not used*/);
    }

	// CLEAR
	unbind_shader();
	unbind_ebo();
	unbind_vao();
	
	//------------------------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------------------------
	// 2nd pass : deferred shading pass
	//------------------------------------------------------------------------------------------------------------------
	//------------------------------------------------------------------------------------------------------------------
	
	// -------------------------------------------------------------------
	// Classical Rendering: default OpenGL framebuffer
	// -------------------------------------------------------------------

	// - reset GL state (unbind the framebuffer, and revert to default)
	pop_fbo();
	gl.drawBuffers([gl.BACK]);
	
	// Clear the GL "color" and "depth" framebuffers (with OR)
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			// --------------------------------
			// - render your scene
			// --------------------------------
		
	// Set "current" shader program
	deffered_shadingPass_shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]
	
	// Activate textures
	tex_sceneColor.bind(0);
	
	// Set uniforms
	// - textures
	Uniforms.uSceneColorTex = 0; // texture unit ID
	Uniforms.uScreenWidth = gl.canvas.width;
	Uniforms.uScreenHeight = gl.canvas.height;
	// - filter type
	Uniforms.uFilterType = slider_filterType.value;
	// - filter threshold
	Uniforms.uFilterThreshold = slider_filterThreshold.value / 100;
	Uniforms.uFilterMaskHalfSize = slider_filterMaskHalfSize.value;
	
	// Draw command(s)
	// - fullscreen (trick: use a triangle 2 times the size of the window <=> equivalent to a fullscreen quad)
	// - render 3 primitives of type "point"
	gl.drawArrays(gl.TRIANGLES, 0, 3);
	
	// Reset the "modified" GL states
	// - the graphics card DRIVER hold a list of "current" elements per type (shader program, vao, vbo, ebo, etc...)
	// - unbind shader program
	gl.useProgram(null); // not mandatory. For optimization, could be removed.
}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_3d();