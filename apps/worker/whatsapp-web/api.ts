import express from 'express';
import { sessionManager } from './session-manager';

const router = express.Router();

/**
 * POST /whatsapp-web/send-text
 * Send a text message via WhatsApp Web
 */
router.post('/send-text', async (req, res) => {
  try {
    const { accountId, to, text } = req.body;

    if (!accountId || !to || !text) {
      return res.status(400).json({ error: 'Missing required fields: accountId, to, text' });
    }

    const result = await sessionManager.sendTextMessage(accountId, to, text);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending text message:', error);
    res.status(500).json({ error: error.message || 'Failed to send text message' });
  }
});

/**
 * POST /whatsapp-web/send-media
 * Send a media message via WhatsApp Web
 */
router.post('/send-media', async (req, res) => {
  try {
    const { accountId, to, mediaUrl, caption, filename } = req.body;

    if (!accountId || !to || !mediaUrl) {
      return res.status(400).json({ error: 'Missing required fields: accountId, to, mediaUrl' });
    }

    const result = await sessionManager.sendMediaMessage(accountId, to, mediaUrl, {
      caption,
      filename,
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending media message:', error);
    res.status(500).json({ error: error.message || 'Failed to send media message' });
  }
});

/**
 * POST /whatsapp-web/send-voice
 * Send a voice message (PTT) via WhatsApp Web
 */
router.post('/send-voice', async (req, res) => {
  try {
    const { accountId, to, audioUrl } = req.body;

    if (!accountId || !to || !audioUrl) {
      return res.status(400).json({ error: 'Missing required fields: accountId, to, audioUrl' });
    }

    const result = await sessionManager.sendVoiceMessage(accountId, to, audioUrl);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending voice message:', error);
    res.status(500).json({ error: error.message || 'Failed to send voice message' });
  }
});

/**
 * POST /whatsapp-web/send-location
 * Send a location message via WhatsApp Web
 */
router.post('/send-location', async (req, res) => {
  try {
    const { accountId, to, latitude, longitude, name, address } = req.body;

    if (!accountId || !to || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Missing required fields: accountId, to, latitude, longitude' });
    }

    const result = await sessionManager.sendLocationMessage(
      accountId,
      to,
      parseFloat(latitude),
      parseFloat(longitude),
      { name, address }
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending location message:', error);
    res.status(500).json({ error: error.message || 'Failed to send location message' });
  }
});

/**
 * POST /whatsapp-web/sync-history
 * Sync chat history for specific phone numbers
 */
router.post('/sync-history', async (req, res) => {
  try {
    const { accountId, phoneNumbers, messagesPerChat } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing required field: accountId' });
    }

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({ error: 'Missing required field: phoneNumbers (array)' });
    }

    const result = await sessionManager.syncSpecificContacts(accountId, {
      phoneNumbers,
      messagesPerChat: messagesPerChat ? parseInt(messagesPerChat) : 50,
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error syncing chat history:', error);
    res.status(500).json({ error: error.message || 'Failed to sync chat history' });
  }
});

/**
 * POST /whatsapp-web/mark-read
 * Mark a message as read in WhatsApp Web
 */
router.post('/mark-read', async (req, res) => {
  try {
    const { accountId, waMessageId } = req.body;

    if (!accountId || !waMessageId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, waMessageId' });
    }

    const result = await sessionManager.markMessageAsRead(accountId, waMessageId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error marking message as read:', error);
    res.status(500).json({ error: error.message || 'Failed to mark message as read' });
  }
});

/**
 * POST /whatsapp-web/send-typing
 * Send typing indicator to a chat
 */
router.post('/send-typing', async (req, res) => {
  try {
    const { accountId, chatId, isTyping } = req.body;

    if (!accountId || !chatId || isTyping === undefined) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId, isTyping' });
    }

    const result = await sessionManager.sendTypingIndicator(accountId, chatId, isTyping);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending typing indicator:', error);
    res.status(500).json({ error: error.message || 'Failed to send typing indicator' });
  }
});

/**
 * POST /whatsapp-web/send-recording
 * Send recording indicator to a chat
 */
router.post('/send-recording', async (req, res) => {
  try {
    const { accountId, chatId, isRecording } = req.body;

    if (!accountId || !chatId || isRecording === undefined) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId, isRecording' });
    }

    const result = await sessionManager.sendRecordingIndicator(accountId, chatId, isRecording);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending recording indicator:', error);
    res.status(500).json({ error: error.message || 'Failed to send recording indicator' });
  }
});

/**
 * POST /whatsapp-web/set-presence
 * Set user presence (online/offline)
 */
router.post('/set-presence', async (req, res) => {
  try {
    const { accountId, available } = req.body;

    if (!accountId || available === undefined) {
      return res.status(400).json({ error: 'Missing required fields: accountId, available' });
    }

    const result = available 
      ? await sessionManager.setPresenceAvailable(accountId)
      : await sessionManager.setPresenceUnavailable(accountId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error setting presence:', error);
    res.status(500).json({ error: error.message || 'Failed to set presence' });
  }
});


/**
 * POST /whatsapp-web/send-reply
 * Send a reply (quoted message)
 */
router.post('/send-reply', async (req, res) => {
  try {
    const { accountId, chatId, text, quotedMessageId } = req.body;

    if (!accountId || !chatId || !text || !quotedMessageId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId, text, quotedMessageId' });
    }

    const result = await sessionManager.sendReply(accountId, chatId, text, quotedMessageId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending reply:', error);
    res.status(500).json({ error: error.message || 'Failed to send reply' });
  }
});

/**
 * POST /whatsapp-web/send-poll
 * Send a poll
 */
router.post('/send-poll', async (req, res) => {
  try {
    const { accountId, chatId, question, options, allowMultipleAnswers } = req.body;

    if (!accountId || !chatId || !question || !options || !Array.isArray(options)) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId, question, options (array)' });
    }

    const result = await sessionManager.sendPoll(
      accountId, 
      chatId, 
      question, 
      options, 
      allowMultipleAnswers || false
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending poll:', error);
    res.status(500).json({ error: error.message || 'Failed to send poll' });
  }
});

/**
 * POST /whatsapp-web/send-sticker
 * Send a sticker
 */
router.post('/send-sticker', async (req, res) => {
  try {
    const { accountId, chatId, mediaUrl } = req.body;

    if (!accountId || !chatId || !mediaUrl) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId, mediaUrl' });
    }

    const result = await sessionManager.sendSticker(accountId, chatId, mediaUrl);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error sending sticker:', error);
    res.status(500).json({ error: error.message || 'Failed to send sticker' });
  }
});

/**
 * POST /whatsapp-web/forward-message
 * Forward a message to another chat
 */
router.post('/forward-message', async (req, res) => {
  try {
    const { accountId, messageId, toChatId } = req.body;

    if (!accountId || !messageId || !toChatId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, messageId, toChatId' });
    }

    const result = await sessionManager.forwardMessage(accountId, messageId, toChatId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error forwarding message:', error);
    res.status(500).json({ error: error.message || 'Failed to forward message' });
  }
});

/**
 * POST /whatsapp-web/create-group
 * Create a new group
 */
router.post('/create-group', async (req, res) => {
  try {
    const { accountId, name, participants } = req.body;

    if (!accountId || !name || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ error: 'Missing required fields: accountId, name, participants (array)' });
    }

    const result = await sessionManager.createGroup(accountId, name, participants);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error creating group:', error);
    res.status(500).json({ error: error.message || 'Failed to create group' });
  }
});

/**
 * POST /whatsapp-web/add-group-participants
 * Add participants to a group
 */
router.post('/add-group-participants', async (req, res) => {
  try {
    const { accountId, groupId, participants } = req.body;

    if (!accountId || !groupId || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ error: 'Missing required fields: accountId, groupId, participants (array)' });
    }

    const result = await sessionManager.addGroupParticipants(accountId, groupId, participants);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error adding group participants:', error);
    res.status(500).json({ error: error.message || 'Failed to add participants' });
  }
});

/**
 * POST /whatsapp-web/remove-group-participants
 * Remove participants from a group
 */
router.post('/remove-group-participants', async (req, res) => {
  try {
    const { accountId, groupId, participants } = req.body;

    if (!accountId || !groupId || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ error: 'Missing required fields: accountId, groupId, participants (array)' });
    }

    const result = await sessionManager.removeGroupParticipants(accountId, groupId, participants);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error removing group participants:', error);
    res.status(500).json({ error: error.message || 'Failed to remove participants' });
  }
});

/**
 * POST /whatsapp-web/promote-group-participants
 * Promote participants to admin
 */
router.post('/promote-group-participants', async (req, res) => {
  try {
    const { accountId, groupId, participants } = req.body;

    if (!accountId || !groupId || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ error: 'Missing required fields: accountId, groupId, participants (array)' });
    }

    const result = await sessionManager.promoteGroupParticipants(accountId, groupId, participants);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error promoting participants:', error);
    res.status(500).json({ error: error.message || 'Failed to promote participants' });
  }
});

/**
 * POST /whatsapp-web/demote-group-participants
 * Demote admins to regular participants
 */
router.post('/demote-group-participants', async (req, res) => {
  try {
    const { accountId, groupId, participants } = req.body;

    if (!accountId || !groupId || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ error: 'Missing required fields: accountId, groupId, participants (array)' });
    }

    const result = await sessionManager.demoteGroupParticipants(accountId, groupId, participants);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error demoting participants:', error);
    res.status(500).json({ error: error.message || 'Failed to demote participants' });
  }
});

/**
 * POST /whatsapp-web/update-group-subject
 * Update group subject (name)
 */
router.post('/update-group-subject', async (req, res) => {
  try {
    const { accountId, groupId, subject } = req.body;

    if (!accountId || !groupId || !subject) {
      return res.status(400).json({ error: 'Missing required fields: accountId, groupId, subject' });
    }

    const result = await sessionManager.updateGroupSubject(accountId, groupId, subject);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error updating group subject:', error);
    res.status(500).json({ error: error.message || 'Failed to update group subject' });
  }
});

/**
 * POST /whatsapp-web/update-group-description
 * Update group description
 */
router.post('/update-group-description', async (req, res) => {
  try {
    const { accountId, groupId, description } = req.body;

    if (!accountId || !groupId || !description) {
      return res.status(400).json({ error: 'Missing required fields: accountId, groupId, description' });
    }

    const result = await sessionManager.updateGroupDescription(accountId, groupId, description);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error updating group description:', error);
    res.status(500).json({ error: error.message || 'Failed to update group description' });
  }
});

/**
 * POST /whatsapp-web/leave-group
 * Leave a group
 */
router.post('/leave-group', async (req, res) => {
  try {
    const { accountId, groupId } = req.body;

    if (!accountId || !groupId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, groupId' });
    }

    const result = await sessionManager.leaveGroup(accountId, groupId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error leaving group:', error);
    res.status(500).json({ error: error.message || 'Failed to leave group' });
  }
});

/**
 * GET /whatsapp-web/group-invite-link/:accountId/:groupId
 * Get group invite link
 */
router.get('/group-invite-link/:accountId/:groupId', async (req, res) => {
  try {
    const { accountId, groupId } = req.params;

    if (!accountId || !groupId) {
      return res.status(400).json({ error: 'Missing required parameters: accountId, groupId' });
    }

    const result = await sessionManager.getGroupInviteLink(accountId, groupId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error getting group invite link:', error);
    res.status(500).json({ error: error.message || 'Failed to get invite link' });
  }
});

/**
 * POST /whatsapp-web/revoke-group-invite-link
 * Revoke group invite link
 */
router.post('/revoke-group-invite-link', async (req, res) => {
  try {
    const { accountId, groupId } = req.body;

    if (!accountId || !groupId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, groupId' });
    }

    const result = await sessionManager.revokeGroupInviteLink(accountId, groupId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error revoking group invite link:', error);
    res.status(500).json({ error: error.message || 'Failed to revoke invite link' });
  }
});

/**
 * GET /whatsapp-web/contact-profile-picture/:accountId/:contactId
 * Get contact profile picture URL
 */
router.get('/contact-profile-picture/:accountId/:contactId', async (req, res) => {
  try {
    const { accountId, contactId } = req.params;

    if (!accountId || !contactId) {
      return res.status(400).json({ error: 'Missing required parameters: accountId, contactId' });
    }

    const result = await sessionManager.getContactProfilePicture(accountId, contactId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error getting contact profile picture:', error);
    res.status(500).json({ error: error.message || 'Failed to get profile picture' });
  }
});

/**
 * GET /whatsapp-web/own-profile-picture/:accountId
 * Get own profile picture URL
 */
router.get('/own-profile-picture/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing required parameter: accountId' });
    }

    const result = await sessionManager.getOwnProfilePicture(accountId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error getting own profile picture:', error);
    res.status(500).json({ error: error.message || 'Failed to get own profile picture' });
  }
});

/**
 * POST /whatsapp-web/set-profile-picture
 * Set own profile picture
 */
router.post('/set-profile-picture', async (req, res) => {
  try {
    const { accountId, imageUrl } = req.body;

    if (!accountId || !imageUrl) {
      return res.status(400).json({ error: 'Missing required fields: accountId, imageUrl' });
    }

    const result = await sessionManager.setOwnProfilePicture(accountId, imageUrl);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error setting profile picture:', error);
    res.status(500).json({ error: error.message || 'Failed to set profile picture' });
  }
});

/**
 * DELETE /whatsapp-web/profile-picture/:accountId
 * Delete own profile picture
 */
router.delete('/profile-picture/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing required parameter: accountId' });
    }

    const result = await sessionManager.deleteOwnProfilePicture(accountId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error deleting profile picture:', error);
    res.status(500).json({ error: error.message || 'Failed to delete profile picture' });
  }
});

/**
 * GET /whatsapp-web/own-status/:accountId
 * Get own status (about text)
 */
router.get('/own-status/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing required parameter: accountId' });
    }

    const result = await sessionManager.getOwnStatus(accountId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error getting own status:', error);
    res.status(500).json({ error: error.message || 'Failed to get status' });
  }
});

/**
 * POST /whatsapp-web/set-status
 * Set own status (about text)
 */
router.post('/set-status', async (req, res) => {
  try {
    const { accountId, status } = req.body;

    if (!accountId || !status) {
      return res.status(400).json({ error: 'Missing required fields: accountId, status' });
    }

    const result = await sessionManager.setOwnStatus(accountId, status);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error setting status:', error);
    res.status(500).json({ error: error.message || 'Failed to set status' });
  }
});

/**
 * POST /whatsapp-web/block-contact
 * Block a contact
 */
router.post('/block-contact', async (req, res) => {
  try {
    const { accountId, contactId } = req.body;

    if (!accountId || !contactId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, contactId' });
    }

    const result = await sessionManager.blockContact(accountId, contactId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error blocking contact:', error);
    res.status(500).json({ error: error.message || 'Failed to block contact' });
  }
});

/**
 * POST /whatsapp-web/unblock-contact
 * Unblock a contact
 */
router.post('/unblock-contact', async (req, res) => {
  try {
    const { accountId, contactId } = req.body;

    if (!accountId || !contactId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, contactId' });
    }

    const result = await sessionManager.unblockContact(accountId, contactId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error unblocking contact:', error);
    res.status(500).json({ error: error.message || 'Failed to unblock contact' });
  }
});

/**
 * POST /whatsapp-web/archive-chat
 * Archive a chat
 */
router.post('/archive-chat', async (req, res) => {
  try {
    const { accountId, chatId } = req.body;

    if (!accountId || !chatId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId' });
    }

    const result = await sessionManager.archiveChat(accountId, chatId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error archiving chat:', error);
    res.status(500).json({ error: error.message || 'Failed to archive chat' });
  }
});

/**
 * POST /whatsapp-web/unarchive-chat
 * Unarchive a chat
 */
router.post('/unarchive-chat', async (req, res) => {
  try {
    const { accountId, chatId } = req.body;

    if (!accountId || !chatId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId' });
    }

    const result = await sessionManager.unarchiveChat(accountId, chatId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error unarchiving chat:', error);
    res.status(500).json({ error: error.message || 'Failed to unarchive chat' });
  }
});

/**
 * POST /whatsapp-web/mute-chat
 * Mute a chat
 */
router.post('/mute-chat', async (req, res) => {
  try {
    const { accountId, chatId, duration } = req.body;

    if (!accountId || !chatId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId' });
    }

    const result = await sessionManager.muteChat(accountId, chatId, duration);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error muting chat:', error);
    res.status(500).json({ error: error.message || 'Failed to mute chat' });
  }
});

/**
 * POST /whatsapp-web/unmute-chat
 * Unmute a chat
 */
router.post('/unmute-chat', async (req, res) => {
  try {
    const { accountId, chatId } = req.body;

    if (!accountId || !chatId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId' });
    }

    const result = await sessionManager.unmuteChat(accountId, chatId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error unmuting chat:', error);
    res.status(500).json({ error: error.message || 'Failed to unmute chat' });
  }
});

/**
 * POST /whatsapp-web/pin-chat
 * Pin a chat
 */
router.post('/pin-chat', async (req, res) => {
  try {
    const { accountId, chatId } = req.body;

    if (!accountId || !chatId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId' });
    }

    const result = await sessionManager.pinChat(accountId, chatId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error pinning chat:', error);
    res.status(500).json({ error: error.message || 'Failed to pin chat' });
  }
});

/**
 * POST /whatsapp-web/unpin-chat
 * Unpin a chat
 */
router.post('/unpin-chat', async (req, res) => {
  try {
    const { accountId, chatId } = req.body;

    if (!accountId || !chatId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId' });
    }

    const result = await sessionManager.unpinChat(accountId, chatId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error unpinning chat:', error);
    res.status(500).json({ error: error.message || 'Failed to unpin chat' });
  }
});

/**
 * DELETE /whatsapp-web/chat/:accountId/:chatId
 * Delete a chat
 */
router.delete('/chat/:accountId/:chatId', async (req, res) => {
  try {
    const { accountId, chatId } = req.params;

    if (!accountId || !chatId) {
      return res.status(400).json({ error: 'Missing required parameters: accountId, chatId' });
    }

    const result = await sessionManager.deleteChat(accountId, chatId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error deleting chat:', error);
    res.status(500).json({ error: error.message || 'Failed to delete chat' });
  }
});

/**
 * POST /whatsapp-web/clear-chat-messages
 * Clear chat messages
 */
router.post('/clear-chat-messages', async (req, res) => {
  try {
    const { accountId, chatId } = req.body;

    if (!accountId || !chatId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, chatId' });
    }

    const result = await sessionManager.clearChatMessages(accountId, chatId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error clearing chat messages:', error);
    res.status(500).json({ error: error.message || 'Failed to clear chat messages' });
  }
});

/**
 * DELETE /whatsapp-web/message-for-everyone
 * Delete a message for everyone
 */
router.delete('/message-for-everyone', async (req, res) => {
  try {
    const { accountId, messageId } = req.body;

    if (!accountId || !messageId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, messageId' });
    }

    const result = await sessionManager.deleteMessageForEveryone(accountId, messageId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error deleting message for everyone:', error);
    res.status(500).json({ error: error.message || 'Failed to delete message for everyone' });
  }
});

/**
 * POST /whatsapp-web/star-message
 * Star a message
 */
router.post('/star-message', async (req, res) => {
  try {
    const { accountId, messageId } = req.body;

    if (!accountId || !messageId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, messageId' });
    }

    const result = await sessionManager.starMessage(accountId, messageId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error starring message:', error);
    res.status(500).json({ error: error.message || 'Failed to star message' });
  }
});

/**
 * POST /whatsapp-web/unstar-message
 * Unstar a message
 */
router.post('/unstar-message', async (req, res) => {
  try {
    const { accountId, messageId } = req.body;

    if (!accountId || !messageId) {
      return res.status(400).json({ error: 'Missing required fields: accountId, messageId' });
    }

    const result = await sessionManager.unstarMessage(accountId, messageId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error unstarring message:', error);
    res.status(500).json({ error: error.message || 'Failed to unstar message' });
  }
});

/**
 * GET /whatsapp-web/starred-messages/:accountId
 * Get all starred messages
 */
router.get('/starred-messages/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing required parameter: accountId' });
    }

    const result = await sessionManager.getStarredMessages(accountId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error getting starred messages:', error);
    res.status(500).json({ error: error.message || 'Failed to get starred messages' });
  }
});

/**
 * GET /whatsapp-web/download-media/:accountId/:messageId
 * Download message media
 */
router.get('/download-media/:accountId/:messageId', async (req, res) => {
  try {
    const { accountId, messageId } = req.params;

    if (!accountId || !messageId) {
      return res.status(400).json({ error: 'Missing required parameters: accountId, messageId' });
    }

    const result = await sessionManager.downloadMessageMedia(accountId, messageId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error downloading message media:', error);
    res.status(500).json({ error: error.message || 'Failed to download message media' });
  }
});

/**
 * POST /whatsapp-web/search-messages
 * Search messages across all chats or specific chat
 */
router.post('/search-messages', async (req, res) => {
  try {
    const { accountId, query, chatId, limit, page } = req.body;

    if (!accountId || !query) {
      return res.status(400).json({ error: 'Missing required fields: accountId, query' });
    }

    const result = await sessionManager.searchMessages(accountId, query, {
      chatId,
      limit: limit ? parseInt(limit) : undefined,
      page: page ? parseInt(page) : undefined,
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error searching messages:', error);
    res.status(500).json({ error: error.message || 'Failed to search messages' });
  }
});

/**
 * GET /whatsapp-web/chat-labels/:accountId
 * Get chat labels/tags
 */
router.get('/chat-labels/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing required parameter: accountId' });
    }

    const result = await sessionManager.getChatLabels(accountId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error getting chat labels:', error);
    res.status(500).json({ error: error.message || 'Failed to get chat labels' });
  }
});

/**
 * GET /whatsapp-web/chat-statistics/:accountId/:chatId
 * Get chat statistics
 */
router.get('/chat-statistics/:accountId/:chatId', async (req, res) => {
  try {
    const { accountId, chatId } = req.params;

    if (!accountId || !chatId) {
      return res.status(400).json({ error: 'Missing required parameters: accountId, chatId' });
    }

    const result = await sessionManager.getChatStatistics(accountId, chatId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error getting chat statistics:', error);
    res.status(500).json({ error: error.message || 'Failed to get chat statistics' });
  }
});

/**
 * GET /whatsapp-web/unread-count/:accountId
 * Get unread message count
 */
router.get('/unread-count/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'Missing required parameter: accountId' });
    }

    const result = await sessionManager.getUnreadCount(accountId);
    
    res.json(result);
  } catch (error: any) {
    console.error('[WhatsApp Web API] Error getting unread count:', error);
    res.status(500).json({ error: error.message || 'Failed to get unread count' });
  }
});

export default router;

