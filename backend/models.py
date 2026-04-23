# -*- coding: utf-8 -*-
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean
from sqlalchemy.sql import func
from database import Base
from datetime import datetime


class Manhwa(Base):
    """Modelo SQLAlchemy para a tabela de manhwas"""
    
    __tablename__ = "manhwas"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(255), nullable=False, index=True)
    cover_url = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="plan_to_read")
    andamento = Column(String(50), nullable=False, default="andamento")
    current_chapter = Column(Integer, default=0)
    total_chapters = Column(Integer, nullable=True)
    rating = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    download = Column(Boolean, nullable=False, default=False)
    medium_reaction = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    def __repr__(self):
        return f"<Manhwa(id={self.id}, title='{self.title}', status='{self.status}')>"
    
    def to_dict(self):
        """Converte o modelo para dicionário"""
        return {
            "id": self.id,
            "title": self.title,
            "cover_url": self.cover_url,
            "status": self.status,
            "andamento": self.andamento,
            "current_chapter": self.current_chapter,
            "total_chapters": self.total_chapters,
            "rating": self.rating,
            "notes": self.notes,
            "download": self.download,
            "medium_reaction": self.medium_reaction,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

class ChapterProgress(Base):
    """Modelo SQLAlchemy para o progresso de leitura (scroll) de um capítulo"""
    
    __tablename__ = "chapter_progress"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    manhwa_id = Column(Integer, index=True, nullable=False)
    filename = Column(String(255), index=True, nullable=False)
    scroll_position = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
