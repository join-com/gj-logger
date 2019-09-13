import logger, { Level } from '@join-com/gcloud-logger-trace';
import * as trace from '@join-com/node-trace';
import { ClassValidationError } from '@join-private/base-errors';
import { GraphQLExtension } from 'apollo-server-core';
import { GraphQLError } from 'graphql';
import { ForbiddenError, Maybe } from 'type-graphql';
import { pick, omit } from '../support/utils';

interface IFormatterOptions {
  whiteList?: string[];
  blackList?: string[];
}

export const formatError = (
  error: GraphQLError,
  options?: IFormatterOptions,
) => {
  if (error.extensions) {
    let exception = error.extensions.exception;
    if (exception && exception.validationErrors) {
      exception = new ClassValidationError(exception.validationErrors);
    } else if (!exception.code) {
      exception = {
        code: 500,
        message: 'Server error',
      };
    }
    if (options) {
      const { whiteList, blackList } = options;
      exception = whiteList ? pick(exception, whiteList) : exception;
      exception = blackList ? omit(exception, blackList) : exception;
    }
    error.extensions.exception = exception;
  }

  return error;
};

const isAboveWarningLevel = (originalError: Maybe<Error>): boolean =>
  !(originalError instanceof ForbiddenError);

const determineLogLevel = (errors: readonly GraphQLError[]): Level => {
  const errorsAboveWarningLevel = errors
    .map(e => e.originalError)
    .filter(isAboveWarningLevel);
  return errorsAboveWarningLevel.length ? Level.ERROR : Level.WARNING;
};

export const errorLoggingExtension: GraphQLExtension = {
  requestDidStart: ({ request }) => {
    if (
      !request ||
      !request.headers ||
      !request.headers.get(trace.getTraceContextName())
    ) {
      logger.warn("No trace id present - can't enable request tracing");
      return;
    }
    trace.start(request.headers.get(trace.getTraceContextName())!);
  },
  didEncounterErrors: errors => {
    const errorMessages = errors.map(e => e.message).join(', ');
    logger.log(
      determineLogLevel(errors),
      `Encountered errors when processing GraphQL request: [${errorMessages}]`,
      errors,
    );
  },
};
export default errorLoggingExtension;
