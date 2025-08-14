import { MailboxMessage, MailboxResponse, CybersAllResponse } from './types';

export interface Message {
  from: string;
  to: string;
  type: string;
  content?: string;
  timestamp: string;
  _read?: boolean;
  _file_path?: string;
}

// Legacy interface for backward compatibility
export type { MailboxMessage };

export class Mailbox {
  private container: HTMLDivElement;
  private messagesContainer: HTMLDivElement;
  private composeContainer: HTMLDivElement;
  private messages: MailboxMessage[] = [];
  private unreadCount: number = 0;
  private isVisible: boolean = false;
  
  constructor() {
    this.container = this.createContainer();
    this.messagesContainer = this.createMessagesContainer();
    this.composeContainer = this.createComposeContainer();
    
    this.container.appendChild(this.messagesContainer);
    this.container.appendChild(this.composeContainer);
    document.body.appendChild(this.container);
  }
  
  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'mailbox-container';
    container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      max-height: 80vh;
      background: rgba(0, 20, 40, 0.95);
      border: 1px solid #0080ff;
      border-radius: 8px;
      display: none;
      flex-direction: column;
      box-shadow: 0 0 20px rgba(0, 128, 255, 0.5);
      z-index: 1000;
    `;
    
    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 15px;
      background: rgba(0, 40, 80, 0.8);
      border-bottom: 1px solid #0080ff;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    const title = document.createElement('h3');
    title.textContent = 'Developer Mailbox';
    title.style.cssText = 'margin: 0; color: #00ffff;';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #00ffff;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
    `;
    closeBtn.onclick = () => this.hide();
    
    header.appendChild(title);
    header.appendChild(closeBtn);
    container.appendChild(header);
    
    return container;
  }
  
  private createMessagesContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      max-height: 400px;
    `;
    return container;
  }
  
  private createComposeContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = `
      padding: 15px;
      border-top: 1px solid #0080ff;
      background: rgba(0, 40, 80, 0.5);
    `;
    
    // To dropdown
    const toContainer = document.createElement('div');
    toContainer.style.cssText = 'margin-bottom: 10px;';
    
    const toLabel = document.createElement('label');
    toLabel.textContent = 'To: ';
    toLabel.style.cssText = 'color: #00ffff; margin-right: 10px;';
    
    const toSelect = document.createElement('select');
    toSelect.id = 'mailbox-to-select';
    toSelect.style.cssText = `
      background: rgba(0, 40, 80, 0.8);
      border: 1px solid #0080ff;
      color: #00ffff;
      padding: 5px;
      width: 200px;
    `;
    
    toContainer.appendChild(toLabel);
    toContainer.appendChild(toSelect);
    
    // Message textarea
    const messageTextarea = document.createElement('textarea');
    messageTextarea.id = 'mailbox-message';
    messageTextarea.placeholder = 'Type your message...';
    messageTextarea.style.cssText = `
      width: 100%;
      height: 80px;
      background: rgba(0, 40, 80, 0.8);
      border: 1px solid #0080ff;
      color: #00ffff;
      padding: 10px;
      margin-bottom: 10px;
      resize: vertical;
    `;
    
    // Send button
    const sendBtn = document.createElement('button');
    sendBtn.textContent = 'Send Message';
    sendBtn.style.cssText = `
      background: #0080ff;
      border: none;
      color: white;
      padding: 8px 16px;
      cursor: pointer;
      border-radius: 4px;
    `;
    sendBtn.onclick = () => this.sendMessage();
    
    container.appendChild(toContainer);
    container.appendChild(messageTextarea);
    container.appendChild(sendBtn);
    
    return container;
  }
  
  show() {
    this.isVisible = true;
    this.container.style.display = 'flex';
    this.refreshMessages();
    this.updateAgentList();
  }
  
  hide() {
    this.isVisible = false;
    this.container.style.display = 'none';
  }
  
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  async refreshMessages() {
    try {
      // Show loading state if visible
      if (this.isVisible && this.messagesContainer.innerHTML !== '') {
        const firstChild = this.messagesContainer.firstChild;
        if (firstChild && firstChild instanceof HTMLElement) {
          firstChild.style.opacity = '0.5';
        }
      }
      
      const response = await fetch('http://localhost:8888/developers/mailbox?include_read=true');
      if (response.ok) {
        const data: MailboxResponse = await response.json();
        this.messages = data.messages || [];
        this.updateMessagesDisplay();
        this.updateUnreadCount();
      }
    } catch (error) {
      console.error('Failed to fetch mailbox:', error);
    }
  }
  
  private updateMessagesDisplay() {
    this.messagesContainer.innerHTML = '';
    
    if (this.messages.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No messages';
      empty.style.cssText = 'color: #666; text-align: center; padding: 20px;';
      this.messagesContainer.appendChild(empty);
      return;
    }
    
    // Get list of unread messages for proper indexing
    const unreadMessages = this.messages.filter(m => !m._read);
    
    this.messages.forEach((msg, _index) => {
      const msgEl = document.createElement('div');
      msgEl.style.cssText = `
        padding: 10px;
        margin-bottom: 10px;
        background: ${msg._read ? 'rgba(0, 40, 80, 0.3)' : 'rgba(0, 80, 160, 0.5)'};
        border: 1px solid ${msg._read ? '#004080' : '#0080ff'};
        border-radius: 4px;
        cursor: ${msg._read ? 'default' : 'pointer'};
      `;
      
      const header = document.createElement('div');
      header.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 5px;';
      
      const from = document.createElement('span');
      from.textContent = `From: ${msg.from}`;
      from.style.cssText = `color: #00ffff; ${msg._read ? 'opacity: 0.7;' : 'font-weight: bold;'}`;
      
      const time = document.createElement('span');
      time.textContent = new Date(msg.timestamp).toLocaleString();
      time.style.cssText = 'color: #0080ff; font-size: 0.9em;';
      
      header.appendChild(from);
      header.appendChild(time);
      
      const content = document.createElement('div');
      content.textContent = msg.content || `[${msg.type}]`;
      content.style.cssText = `color: #ffffff; ${msg._read ? 'opacity: 0.7;' : ''}`;
      
      msgEl.appendChild(header);
      msgEl.appendChild(content);
      
      // Only allow marking unread messages as read
      if (!msg._read) {
        const unreadIndex = unreadMessages.indexOf(msg);
        msgEl.onclick = () => this.markAsRead(unreadIndex);
        msgEl.title = 'Click to mark as read';
      }
      
      this.messagesContainer.appendChild(msgEl);
    });
  }
  
  private async markAsRead(unreadIndex: number) {
    try {
      const response = await fetch('http://localhost:8888/developers/mailbox/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message_index: unreadIndex }),
      });
      
      if (response.ok) {
        // Refresh messages to get updated state
        await this.refreshMessages();
      }
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  }
  
  private updateUnreadCount() {
    this.unreadCount = this.messages.filter(m => !m._read).length;
    // Dispatch event for UI to update indicator
    window.dispatchEvent(new CustomEvent('mailbox-unread-count', { 
      detail: { count: this.unreadCount } 
    }));
  }
  
  private async updateAgentList() {
    try {
      const response = await fetch('http://localhost:8888/Cybers/all');
      if (response.ok) {
        const data: CybersAllResponse = await response.json();
        const select = document.getElementById('mailbox-to-select') as HTMLSelectElement;
        select.innerHTML = '';
        
        const cybers = data.cybers || [];
        cybers.forEach((cyber) => {
          const option = document.createElement('option');
          option.value = cyber.name || cyber.agent_id;
          option.textContent = cyber.name || cyber.agent_id;
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Failed to fetch cybers:', error);
    }
  }
  
  private async sendMessage() {
    const select = document.getElementById('mailbox-to-select') as HTMLSelectElement;
    const textarea = document.getElementById('mailbox-message') as HTMLTextAreaElement;
    
    const to = select.value;
    const content = textarea.value.trim();
    
    if (!to || !content) {
      alert('Please select a recipient and enter a message');
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:8888/Cybers/${to}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, message_type: 'text' }),
      });
      
      if (response.ok) {
        textarea.value = '';
        alert('Message sent!');
      } else {
        alert('Failed to send message');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message');
    }
  }
  
  getUnreadCount(): number {
    return this.unreadCount;
  }
}