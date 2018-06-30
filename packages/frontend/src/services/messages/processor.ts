import { DS } from 'ember-data';
import Service from '@ember/service';
import { service } from '@ember-decorators/service';

import RelayConnection from 'emberclear/services/relay-connection';
import IdentityService from 'emberclear/services/identity/service';
import Identity from 'emberclear/data/models/identity/model';

import { decryptFrom } from 'emberclear/src/utils/nacl/utils';
import { fromHex, toString, fromBase64 } from 'emberclear/src/utils/string-encoding';

export default class MessageProcessor extends Service {
  // anything which *must* be merged to prototype here
  // toast = service('toast');
  @service store!: DS.Store;
  @service identity!: IdentityService;
  @service relayConnection!: RelayConnection;

  async receive(socketData: RelayMessage) {
    const { uid, message } = socketData;
    const senderPublicKey = fromHex(uid);
    const recipientPrivateKey = this.identity.privateKey!;

    const decrypted = await this.decryptMessage(message, senderPublicKey, recipientPrivateKey);
    // once received, parse it into a message,
    // and save it. ember-data and the routing
    // will take care of where to place the
    // message in the UI

    await this.importMessage(decrypted);
  }

  async decryptMessage(message: string, senderPublicKey: Uint8Array, recipientPrivateKey: Uint8Array) {
    const messageBytes = await fromBase64(message);

    const decrypted = await decryptFrom(
      messageBytes, senderPublicKey, recipientPrivateKey
    );

    // TODO: consider a binary format, instead of
    //       converting to/from string and json
    const payload = toString(decrypted);
    const data = JSON.parse(payload);

    return data;
  }

  async importMessage(json: RelayJson) {
    const { message: msg, sender: senderInfo } = json;

    const sender = await this.findOrCreateSender(senderInfo);

    const message = this.store.createRecord('message', {
      from: sender.name,
      sentAt: json.time_sent,
      receivedAt: new Date(),
      body: msg.body,
      channel: msg.channel,
      thread: msg.thread,
      contentType: msg.contentType
    });

    message.save();

    return message;
  }

  async findOrCreateSender(senderData: RelayJson["sender"]): Promise<Identity> {
    const { name, uid } = senderData;
    const publicKey = fromHex(uid);

    try {
      let record = await this.store.findRecord('identity', uid);
      record.set('name', name);

      return record;
    } catch (e) {
      let record = this.store.createRecord('identity', {
        publicKey,
        name
      });

      record.save();

      return record;
    }


  }
}

// DO NOT DELETE: this is how TypeScript knows how to look up your services.
declare module '@ember/service' {
  interface Registry {
    'messages/processor': MessageProcessor
  }
}
