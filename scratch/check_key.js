import { fromBase64 } from '@mysten/sui/utils';
const b = fromBase64('AJUqEaeeIQHckIzoeRFp+BClnAi03tD9QsBaHHPocE6/');
console.log('Length:', b.length);
console.log('First byte:', b[0]);
