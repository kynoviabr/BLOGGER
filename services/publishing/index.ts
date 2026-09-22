import { Publisher } from './publisher.interface';
import { MockPublisher } from './mock-publisher';

let currentPublisher: Publisher = new MockPublisher();

export function getPublisher(): Publisher {
  return currentPublisher;
}

export function registerPublisher(publisher: Publisher): void {
  currentPublisher = publisher;
}

export * from './publisher.interface';
export * from './mock-publisher';
