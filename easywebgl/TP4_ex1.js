
"use strict"

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var vertexShader =
`#version 300 es

// INPUT
// - the currently bounded vertex array (VAO) contains a VBO of 3D data (positions)
// - variable is prefixed by "in"
// - its "location index" MUST be the same value when using vertexAttribPointer() and enableVertexAttribArray() during VAO definition
layout(location=1) in vec3 position_in;
layout(location=3) in vec2 textureCoord_in;

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

// OUTPUT
out vec2 v_textureCoord;

// MAIN PROGRAM
void main()
{
	// Send data to graphics pipeline
	v_textureCoord = textureCoord_in;

	// MANDATORY
	// - a vertex shader MUST write the value of the predined variable " (GLSL langage)"
	// - this value represent a position in "clip-space"
	// - This is the space just before dividing coordinates "xyz" by their "w" to lie in NDC space (normalized device coordinates),
	// - i.e a cube in [-1.0;1.0]x[-1;1.0]x[-1;1.0]
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
uniform sampler2D uSampler;
// MAIN PROGRAM
void main()
{
	// MANDATORY
	// - a fragment shader MUST write an RGBA color
	oFragmentColor = texture(uSampler,v_textureCoord); // [values are between 0.0 and 1.0]
}
`;

//--------------------------------------------------------------------------------------------------------
// GLOBAL VARIABLES
//--------------------------------------------------------------------------------------------------------

// Shader program
var shaderProgram = null;
var texture = null;

var cube_rend = null;


// GUI (graphical user interface)
// - mesh color
var slider_r;
var slider_g;
var slider_b;

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
		// MESH COLOR
	    // - container (H: horizontal)
		UserInterface.use_field_set('H', "Mesh Color");
			// - sliders (name, min, max, default value, callback called when value is modified)
			// - update_wgl() is called to refresh screen
			slider_r  = UserInterface.add_slider('R ', 0, 100, 0, update_wgl);
			UserInterface.set_widget_color(slider_r,'#ff0000','#ffcccc');
			slider_g  = UserInterface.add_slider('G ', 0, 100, 100, update_wgl);
			UserInterface.set_widget_color(slider_g,'#00bb00','#ccffcc');
			slider_b  = UserInterface.add_slider('B ', 0, 100, 100, update_wgl);
			UserInterface.set_widget_color(slider_b, '#0000ff', '#ccccff');
		UserInterface.end_use();
	UserInterface.end();
	
	// Create and initialize a shader program // [=> Sylvain's API - wrapper of GL code]
    shaderProgram = ShaderProgram(vertexShader, fragmentShader, 'basic shader');
    
    
	let mesh = Mesh.Cube();
	cube_rend = mesh.renderer(1, 2, 3);

	ewgl.scene_camera.set_scene_radius(mesh.BB.radius);
	ewgl.scene_camera.set_scene_center(mesh.BB.center);		

    texture = gl.createTexture();
    const image = new Image;
    image.src = 'textures/lined_woolen_material_2020103_cropped_scrop.JPG';
    image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T, gl.REPEAT);

        gl.bindTexture(gl.TEXTURE_2D,null);
    };
	// Set default GL states
	// - color to use when refreshing screen
	gl.clearColor(0, 0, 0 ,1); // black opaque [values are between 0.0 and 1.0]
	// - enable "depth test"
	// => to optimize rendering when lots of triangles
	// => you cannot control triangles ordering at rendering, but "z-buffer" prevent from rendering triangles behind previously rendered triangles
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
	//Uniforms.uMeshColor = [slider_r.value/100, slider_g.value/100, slider_b.value/100];
	// - camera
	// ---- retrieve current camera matrices ("view" matrix reacts to mouse events)
	Uniforms.uProjectionMatrix = ewgl.scene_camera.get_projection_matrix();
	Uniforms.uViewMatrix = ewgl.scene_camera.get_view_matrix();
	// - set model matrix
	// ---- configure YOUR custom transformations (scale, rotation, translation)
    let modelMatrix = Matrix.scale(0.5); // hard-coded "scale" to be able to see the 3D asset
	Uniforms.uModelMatrix = modelMatrix;

	// [part C] : render your scene (3D model)
	
    // Activate texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    // TODO : 
	// - set GL state
	// - set uniform
    Uniforms.uSampler = 0;
	cube_rend.draw(gl.TRIANGLES);
	
	// -------------------------------------------------------------------
	// [3] - Reset the "modified" GL states
	//     - the graphics card DRIVER hold a list of "current" elements per type (shader program, vao, vbo, ebo, etc...)
	// -------------------------------------------------------------------
		
    // Reset GL state(s)

    gl.bindTexture(gl.TEXTURE_2D,null);
	// - unbind vertex array
	gl.bindVertexArray(null); // not mandatory. For optimization, could be removed.
	// - unbind shader program
	gl.useProgram(null); // not mandatory. For optimization, could be removed.
}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_3d();