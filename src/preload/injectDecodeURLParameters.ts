import { 
  PreloadFunc, 

  mapPropertyAware,
  conditional,

  URLParameterDecoder,
  urlParameterDecoder,

  mapHTTPError,
  PreloadError,
} from 'wetu';

// TODO This should be moved to the core wetu codebase
const extractPathVariableNames = (pathDef: string | string[]): string[] => {
  // If the pathdef is multiple paths (array) we use the first of these (index 0)
  // we known the variables are the same in each step because this is garanteed before
  // the preload step is executed
  const path: string = Array.isArray(pathDef) ? pathDef[0] : pathDef;

  // Extract the variables from the string
  return path.split('/').filter(x => x.startsWith('@')).map(x => x.slice(1));
}

/**
 * Injects a decodeURLParameters function if a URLParameters export exists 
 * and it implements AutoEncoder from simple-encoding.
 *
 * If there are optional fields in the URLParameters object the preload will fail
 *
 * If there are fields in the URLParameters object that do not match any of the  
 * variables defined with an `@` in the path the preload will fail.
 */
const injectDecodeURLParameters: PreloadFunc = conditional(
  ({ URLParameters }: any) => {
    // Check if the module exports a member URLParameters of type object 
    // that extends AutoEncoder from simple-encoding
    return URLParameters?.__proto__.name === 'AutoEncoder';
  },

  // Map the URLParameters property to a decodeURLParameters function to the 
  // URLParameters class
  mapPropertyAware(
    'URLParameters', 
    'decodeURLParameters', 
    (URLParameters, { path }): URLParameterDecoder<typeof URLParameters> => {
      // Use the baked in URLParameterDecoder to extract params from path.
      const simpleURLParameterDecoder = urlParameterDecoder.fromPathDef(path);

      // Check if the paths contains the same members as the URLParameters object
      // NOTE: you can have pathvariables that are not included in the URLParameters 
      //       object but the reverse is not possible all fields of the URLParameters 
      //       object must be present in the path defenition
      const fields: string[] | undefined = URLParameters?.fields.map(({ field }) => field);
      const pathVariables = extractPathVariableNames(path);
      const missing = fields?.filter(field => !pathVariables.includes(field));
      if(missing.length !== 0) {
        throw new PreloadError({ 
          preloadName: 'wetu-simple-encoding/InjectDecodeURLParameters',
          message: `Missing required variable${ missing.length > 1 ? 's' : '' } "${ missing.join(', ') }"`,
        })
      }

      // Check if all the fields are required because optional fields are 
      // not supported on URLParameters
      const optionals = URLParameters?.fields.filter(({ optional }) => optional).map(({ field }) => field);
      if(optionals.length !== 0) {
        throw new PreloadError({ 
          preloadName: 'wetu-simple-encoding/InjectDecodeURLParameters',
          message: `URLParameters cannot include optional field${ optionals.length > 1 ? 's' : ''} "${ optionals.join(', ')}"`,
        });
      }

      // Return the middleware function
      return (path: string) => {
        try {
          // Extract the paramaters to a plane object
          const rawParameters = simpleURLParameterDecoder(path);

          // Return the created object
          return URLParameters.create(rawParameters);
        } catch(error) {
          // Catch erros and translate them into a http error
          throw mapHTTPError(400, error);
        }
      }
    },
  )
);

export default injectDecodeURLParameters;
