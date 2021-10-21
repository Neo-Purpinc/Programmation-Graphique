
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
// - Model
uniform mat4 uModelMatrix;

// OUTPUT
out vec2 v_textureCoord;

// MAIN PROGRAM
void main()
{
	// Send texture coords to fragment shader via the graphics pipeline
	v_textureCoord = textureCoord_in;

	gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(position_in, 1.0);
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

// OUPUT
out vec4 oFragmentColor;

// UNIFORM
uniform sampler2D uSampler;

// MAIN PROGRAM
void main()
{
	vec4 textureColor = texture(uSampler, v_textureCoord);

	oFragmentColor = textureColor; // [values are between 0.0 and 1.0]
}
`;

//--------------------------------------------------------------------------------------------------------
// GLOBAL VARIABLES
//--------------------------------------------------------------------------------------------------------

// Shader program
var shaderProgram = null;
var texture = null;

var cube_rend = null;

//--------------------------------------------------------------------------------------------------------
// Initialize graphics objects and GL states
//--------------------------------------------------------------------------------------------------------
function init_wgl()
{
	// ANIMATIONS // [=> Sylvain's API]
	ewgl.continuous_update = true;
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
	shaderProgram = ShaderProgram(vertexShader, fragmentShader, 'basic shader');

	// Create a mesh cube with assosiated VAA containing VBO positions, VBO normals, VBO texture coords and VBO colors [=> Sylvain's API - wrapper of GL code]
	let mesh = Mesh.Cube();
	cube_rend = mesh.renderer(1, -1, 2); // associated renderer of the mesh. Parameters define the ID of each VBO
	// set the caera center and radius according to the Cube mesh
	ewgl.scene_camera.set_scene_radius(mesh.BB.radius);
	ewgl.scene_camera.set_scene_center(mesh.BB.center);

	// TEXTURE
	texture = gl.createTexture();
	const image = new Image();
    //image.src = 'images/14596343807_24e447963c_o_crop_scrop.png';
	image.src = 'images/lined_woolen_material_2020103_cropped_scrop.JPG';
    image.onload = () => {
	    
		// Bind texture as the "current" one
		// - each followinf GL call will affect its internal state
        gl.bindTexture(gl.TEXTURE_2D, texture);
		
		// Configure data type (storage on GPU) and upload image data to GPU
		// - RGBA: 4 comonents
		// - UNSIGNED_BYTE: each component is an "unsigned char" (i.e. value in [0;255]) => NOTE: on GPU data is automatically accessed with float type in [0;1] by default
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
		
		// Configure "filtering" mode
		// => what to do when, projected on screen, a texel of an image is smaller than a screen pixel or when a texel covers several screen pixel
		// => example: when a texture is mapped onto a terrain in the far distance, or when you zoom a lot
		// NEAREST: fast but low quality (neearest texel is used)
		//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		// LINEAR: slower but better quality => take 4 neighboring pixels and compute the mean value
		//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		// MIPMAPPING: build a pyramid of level of details from imaghe size to 1 pixel, duviding each image size by 2
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
		gl.generateMipmap(gl.TEXTURE_2D); // => build the pyramid of textrues automatically
		
		// Configure wrapping behavior: what to do when texture coordinates exceed [0;1]
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);	
		
		// Clean GL state
        gl.bindTexture(gl.TEXTURE_2D, null);
    };
		
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
	// --------------------------------
	// [1] - always do that
	// --------------------------------
	
	// Clear the GL "color" and "depth" framebuffers (with OR)
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	// --------------------------------
	// [2] - render your scene
	// --------------------------------
	
	// [part A] : set "current" shader program
	
	// Set "current" shader program
	shaderProgram.bind(); // [=> Sylvain's API - wrapper of GL code]

	// [part B] : set/modify GPU "uniform" variables of current shader program
	
	// Set uniforms // [=> Sylvain's API - wrapper of GL code]
	// - transformation matrix
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	Uniforms.uViewMatrix = ewgl.scene_camera.get_view_matrix();
	Uniforms.uModelMatrix = Matrix.scale(0.5); // hard-coded "scale" to be able to see the 3D asset

	// [part C] : render your scene (3D model)
	
	// Activate texture
	// - set GL state
  	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	// - set uniform
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
	// - unbind texture
	gl.bindTexture(gl.TEXTURE_2D, null); // not mandatory. For optimization, could be removed.
}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_3d();
