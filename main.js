const N = 80;
const nDraw = N;
let clicked = 0;
const scale_amt = 0.3;

main();

// https://www.shadertoy.com/view/4tj3Dy
// https://gamedev.stackexchange.com/questions/68912/how-does-this-bezier-curve-rendering-shader-determine-if-a-curve-is-concave-or-c

function main() {
  const canvas = document.querySelector("#glcanvas");
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true });
  // Triangulation shaders
  const fillVs = `
   	attribute vec2 aVertexPosition;
    void main() {
      gl_Position =  vec4(aVertexPosition, 0.,1.0);
    }
  `;
  const fillFs = `
    precision mediump float;
  	uniform vec4 col;
    void main() {
      gl_FragColor =  col;
    }
  `;

  // Curve shaders
  const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 uv;
    attribute float aDirection;    
    
    varying vec2 vUv;
    varying float direction;
    void main() {
      direction = aVertexPosition.z;
      vUv = uv;
      gl_Position =  vec4(aVertexPosition.xy, 0., 1.0);
    }
  `;

  const fsSource = `
     #extension GL_EXT_shader_texture_lod : enable
     #extension GL_OES_standard_derivatives : enable

     #define FILL 1

     precision mediump float;
     uniform vec4 col;
     
     varying vec2 vUv;
     varying float direction;
     float thickness = 1.5;
     uniform bool drawTriangles;
     
     // https://stackoverflow.com/questions/31336454/draw-quadratic-curve-on-gpu/31423105#31423105
    void main() {
       vec4 color = col; 
       float scale_amt =  -${scale_amt};
       vec2 scaled = vUv * (1.0 - scale_amt) + scale_amt / 3.;
   		 vec2 p = (scaled.x * vec2(0.5, 0.0) + scaled.y * vec2(1.0));    
       
       // Gradients  
       vec2 px = dFdx(p);  
       vec2 py = dFdy(p);  
       // Chain rule  
       float fx = (2.*p.x)*px.x - px.y;  
       float fy = (2.*p.x)*py.x - py.y;  
       // Signed distance  
       float sd = (p.x*p.x - p.y)/sqrt(fx*fx + fy*fy);  
       // Linear alpha  
       float alpha = thickness - abs(sd);  
       
       if(drawTriangles)
       #if FILL
        sd*=direction;
        if(sd >= 0.0) {
            discard;
          //color.a = alpha;
        }
        
        color.a = min(abs(sd), 1.0); //sd; // smoothstep(0., 1.0, sd);
        #else
        if (alpha > 1.)       // Inside  
          color.a = 1.;  
        else if (alpha < 0.)  // Outside  
          discard;  
        else                     
          color.a = alpha; 
        #endif
        gl_FragColor = color;
    }
  `;

  gl.getExtension("OES_standard_derivatives");
  gl.getExtension("EXT_shader_texture_lod");
  gl.getExtension("ANGLE_instanced_arrays");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Initialize curve program
  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
  // Initialize fill for
  const fillProgram = initShaderProgram(gl, fillVs, fillFs);

  const curveColUniform = gl.getUniformLocation(shaderProgram, "col");
  const drawTriangles = gl.getUniformLocation(shaderProgram, "drawTriangles");
  const fillColUniform = gl.getUniformLocation(fillProgram, "col");

  const curveProgramInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
      uvs: gl.getAttribLocation(shaderProgram, "uv"),
    },
  };

  const fillProgramInfo = {
    program: fillProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(fillProgram, "aVertexPosition"),
    },
  };

  const buffers = initBuffers(gl);

  // Draw the scene
  gl.clearColor(1.0, 1.0, 1.0, 1.0); // Clear to black, fully opaque
  gl.clearDepth(1.0); // Clear everything
  gl.disable(gl.CULL_FACE);

  const colors = [[1.0, 0.0, 1.0, 1.0]];
  let pointPositions = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pointPositions[i] = Math.sin(i);
  }

  const num = 1;
  const drawCount = fillBuffers(gl, pointPositions, buffers);
  const animate = () => {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(fillProgram);
    gl.uniform4fv(fillColUniform, colors[0]);
    if (clicked % 4)
      drawScene(
        gl,
        fillProgramInfo,
        buffers,
        false,
        drawCount,
        clicked % 4 === 1 ? gl.LINES : gl.TRIANGLES
      );

    gl.useProgram(shaderProgram);

    gl.uniform1i(drawTriangles, 1);
    gl.uniform4fv(curveColUniform, colors[0]);
    if (clicked % 4 !== 3)
      drawScene(gl, curveProgramInfo, buffers, true, drawCount, gl.TRIANGLES);

    // requestAnimationFrame(animate);
  };

  document.body.addEventListener("click", () => {
    clicked++;
    animate();
  });

  animate();
}

function fillBuffers(gl, pointPositions, buffers) {
  const vertices = new Float32Array(nDraw * 9);
  const fillVerts = [];

  const len = N - 1;
  const baseY = 0;

  const s = 2;

  let px = -s / 2;
  let py = pointPositions[0] + baseY;

  fillVerts.push(-1, baseY - 0.1);
  for (let i = 0; i < nDraw / 2 - 1; i++) {
    const x = (i / len) * 2.0 - 1.0;
    const y = pointPositions[i] / 5 + baseY;
    const nextX = ((i + 1) / len) * 2.0 - 1.0;
    const nextY = pointPositions[i + 1] / 5 + baseY;

    const cpx = (x + nextX) / 2;
    const cpy = (y + nextY) / 2;

    let slopeCP = (cpy - py) / (cpx - px);
    let slope = (y - py) / (x - px);

    let downwardsSlope = slope < slopeCP;

    if (i < nDraw) {
      if (downwardsSlope) {
        fillVerts.push(px, py);
        fillVerts.push(x, y);
      } else {
        fillVerts.push(px, py);
      }
    }

    let m = downwardsSlope ? -1 : 1;

    const Mx = (x + px + cpx) / 3;
    const My = (y + py + cpy) / 3;

    const bi = i * 9;
    const s = 1.0 + scale_amt;
    vertices[bi + 0] = Mx + (px - Mx) * s;
    vertices[bi + 1] = My + (py - My) * s;
    vertices[bi + 2] = m;
    vertices[bi + 3] = Mx + (x - Mx) * s;
    vertices[bi + 4] = My + (y - My) * s;
    vertices[bi + 5] = m;
    vertices[bi + 6] = Mx + (cpx - Mx) * s;
    vertices[bi + 7] = My + (cpy - My) * s;
    vertices[bi + 8] = m;

    px = cpx;
    py = cpy;
  }

  const indices = earcut(fillVerts);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.fillPos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fillVerts), gl.STATIC_DRAW);
  return indices.length;
}

function initBuffers(gl) {
  const positionBuffer = gl.createBuffer();
  const uvBuffer = gl.createBuffer();
  const indBuffer = gl.createBuffer();
  const fillPos = gl.createBuffer();

  const uvDatas = [];
  for (let i = 0; i <= nDraw; i++) {
    uvDatas.push(0.0, 0, 1.0, 0, 0, 1.0);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvDatas), gl.STATIC_DRAW);

  return {
    uvs: uvBuffer,
    position: positionBuffer,
    indices: indBuffer,
    fillPos,
  };
}

function drawScene(
  gl,
  programInfo,
  buffers,
  curveProgram,
  drawCount,
  type = gl.TRIANGLES
) {
  const { vertexPosition, uvs } = programInfo.attribLocations;

  if (curveProgram) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(vertexPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vertexPosition);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.uvs);
    gl.vertexAttribPointer(uvs, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(uvs);
  } else {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.fillPos);
    gl.vertexAttribPointer(vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vertexPosition);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
  }

  gl.useProgram(programInfo.program);
  const count = 3 * nDraw;
  if (curveProgram) {
    gl.drawArrays(type, 0, count);
  } else {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
    gl.drawElements(type, drawCount, gl.UNSIGNED_SHORT, 0);
  }
}

// WebGL helper functions
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert(
      "Unable to initialize the shader program: " +
        gl.getProgramInfoLog(shaderProgram)
    );
    return null;
  }

  return shaderProgram;
}

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(
      "An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader)
    );
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}
