// The parts of three.js that Rongu uses, bundled into public/mascot/vendor/three-rongu.min.js.
// Rebuild (three 0.186.1, esbuild 0.28.2), from a folder whose node_modules/three is that package:
//   npm pack three@0.186.1 && tar -xzf three-0.186.1.tgz && mkdir -p node_modules && mv package node_modules/three
//   npx esbuild@0.28.2 three-rongu.entry.js --bundle --minify --format=esm --legal-comments=eof --outfile=three-rongu.min.js
// Add a name here when the mascot code starts using a new three.js class.
export {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CapsuleGeometry, CircleGeometry, Color,
  ConeGeometry, CylinderGeometry, DirectionalLight, DoubleSide, DynamicDrawUsage, Euler, ExtrudeGeometry, Group,
  HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, NeutralToneMapping,
  PCFShadowMap, PMREMGenerator, PerspectiveCamera, Plane, PlaneGeometry, QuadraticBezierCurve3, Quaternion, Raycaster, SRGBColorSpace,
  Scene, ShadowMaterial, Shape, ShapeGeometry, SphereGeometry, Sprite, SpriteMaterial, TorusGeometry, TubeGeometry, Vector2, Vector3,
  Vector4, WebGLRenderer,
} from 'three';
export { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
